import { Ctx, ToolError } from "./context.js";
import { ensureGuest } from "./guests.js";
import { recordReferral } from "./attribution.js";

export interface RideInput {
  phone: string;
  hotel: string;
  party_size: number;
  arrival_date: string;     // YYYY-MM-DD, local to the destination
  referral_code?: string;
  idempotency_key: string;  // one per guest intent; a retry reuses it
}

// The agent can propose a booking. This function decides whether it happens.
export function bookAirportRide(ctx: Ctx, input: RideInput) {
  // 1. Validate everything the model could get plausibly wrong.
  if (!input.idempotency_key || input.idempotency_key.length < 8) throw new ToolError("idempotency_key is required");
  if (!ctx.hotels.includes(input.hotel)) throw new ToolError(`unknown hotel "${input.hotel}". Ask the guest to pick from: ${ctx.hotels.join(", ")}`);
  if (!Number.isInteger(input.party_size) || input.party_size < 1 || input.party_size > 12) throw new ToolError("party_size must be 1 to 12");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.arrival_date)) throw new ToolError("arrival_date must be YYYY-MM-DD");
  const today = ctx.now().toISOString().slice(0, 10);
  if (input.arrival_date < today) throw new ToolError(`arrival_date ${input.arrival_date} is in the past. Confirm the date with the guest`);

  // 2. Idempotency: the same key returns the same booking, without a second charge.
  const existing = ctx.db.prepare(`SELECT * FROM bookings WHERE idempotency_key = ?`).get(input.idempotency_key);
  if (existing) return { duplicate: true, booking: existing };

  const guest = ensureGuest(ctx, input.phone);
  const tx = ctx.db.transaction(() => {
    ctx.db.prepare(
      `INSERT INTO stays (guest_id, arrival_date, hotel, party_size) VALUES (?, ?, ?, ?)
       ON CONFLICT(guest_id, arrival_date) DO UPDATE SET hotel = excluded.hotel, party_size = excluded.party_size`,
    ).run(guest.id, input.arrival_date, input.hotel, input.party_size);
    const stay = ctx.db.prepare(`SELECT * FROM stays WHERE guest_id = ? AND arrival_date = ?`).get(guest.id, input.arrival_date) as { id: number; referral_code: string | null };
    if (input.referral_code) recordReferral(ctx, stay.id, input.referral_code);
    const code = (ctx.db.prepare(`SELECT referral_code FROM stays WHERE id = ?`).get(stay.id) as { referral_code: string | null }).referral_code;

    const bk = ctx.bokun.createBooking({ product: "airport-ride", amountCents: ctx.airportRideCents, currency: "USD", date: input.arrival_date });
    ctx.db.prepare(
      `INSERT INTO bookings (stay_id, product, amount_cents, currency, idempotency_key, bokun_booking_id, referral_code, status, created_at)
       VALUES (?, 'airport-ride', ?, 'USD', ?, ?, ?, 'confirmed', ?)`,
    ).run(stay.id, ctx.airportRideCents, input.idempotency_key, bk.bookingId, code, ctx.now().toISOString());

    ctx.hubspot.upsertContact(input.phone, {
      hotel: input.hotel, party_size: input.party_size, arrival_date: input.arrival_date,
      referral_code: code, last_booking: bk.bookingId,
    });
    return { duplicate: false, bokun_booking_id: bk.bookingId, payment_link: bk.paymentLink, referral_code: code };
  });
  return tx();
}
