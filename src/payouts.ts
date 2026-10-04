import type { Ctx } from "./tools/context.js";

// Nightly job: every attended, attributed booking earns one commission row.
// Running it twice changes nothing (UNIQUE(booking_id, entry)).
export function runNightlyPayout(ctx: Ctx) {
  const rows = ctx.db.prepare(
    `SELECT b.id, b.amount_cents, b.referral_code FROM bookings b
     WHERE b.status = 'attended' AND b.referral_code IS NOT NULL`,
  ).all() as { id: number; amount_cents: number; referral_code: string }[];
  const ins = ctx.db.prepare(
    `INSERT INTO ledger (booking_id, seller_code, entry, amount_cents, created_at)
     VALUES (?, ?, 'commission', ?, ?) ON CONFLICT(booking_id, entry) DO NOTHING`,
  );
  let written = 0;
  ctx.db.transaction(() => {
    for (const r of rows) {
      written += ins.run(r.id, r.referral_code, Math.round(r.amount_cents * ctx.commissionRate), ctx.now().toISOString()).changes;
    }
  })();
  return { written, payoutFile: payoutFile(ctx) };
}

// A refund never edits history: it adds a reversing row if a commission was paid.
export function refundBooking(ctx: Ctx, bookingId: number) {
  const b = ctx.db.prepare(`SELECT * FROM bookings WHERE id = ?`).get(bookingId) as { bokun_booking_id: string } | undefined;
  if (!b) throw new Error("no such booking");
  ctx.db.transaction(() => {
    ctx.bokun.refund(b.bokun_booking_id);
    ctx.db.prepare(`UPDATE bookings SET status = 'refunded' WHERE id = ?`).run(bookingId);
    const c = ctx.db.prepare(`SELECT * FROM ledger WHERE booking_id = ? AND entry = 'commission'`).get(bookingId) as { seller_code: string; amount_cents: number } | undefined;
    if (c) {
      ctx.db.prepare(
        `INSERT INTO ledger (booking_id, seller_code, entry, amount_cents, created_at) VALUES (?, ?, 'reversal', ?, ?)
         ON CONFLICT(booking_id, entry) DO NOTHING`,
      ).run(bookingId, c.seller_code, -c.amount_cents, ctx.now().toISOString());
    }
  })();
}

// Balance per seller, i.e. what the bank payout file would contain.
export function payoutFile(ctx: Ctx) {
  return ctx.db.prepare(
    `SELECT seller_code, SUM(amount_cents) AS balance_cents FROM ledger GROUP BY seller_code ORDER BY seller_code`,
  ).all() as { seller_code: string; balance_cents: number }[];
}
