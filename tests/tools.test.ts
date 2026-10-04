import { describe, it, expect } from "vitest";
import { makeCtx } from "../src/setup.js";
import { bookAirportRide } from "../src/tools/booking.js";
import { recordReferral } from "../src/tools/attribution.js";
import { sendToGuest } from "../src/tools/messaging.js";
import { logInbound } from "../src/tools/guests.js";
import { ToolError } from "../src/tools/context.js";

const phone = "+18095550101";
const ride = { phone, hotel: "Barcelo Bavaro", party_size: 2, arrival_date: "2027-02-03", idempotency_key: "ride-abc-12345" };

describe("booking tool", () => {
  it("rejects what the model can plausibly get wrong", () => {
    const ctx = makeCtx();
    expect(() => bookAirportRide(ctx, { ...ride, arrival_date: "2026-02-03" })).toThrow(/in the past/);
    expect(() => bookAirportRide(ctx, { ...ride, hotel: "Barcelo" })).toThrow(/unknown hotel/);
    expect(() => bookAirportRide(ctx, { ...ride, party_size: 0 })).toThrow(ToolError);
    expect(() => bookAirportRide(ctx, { ...ride, phone: "8095550101" })).toThrow(/E\.164/);
    expect(ctx.bokun.calls).toBe(0);
  });

  it("a retried call with the same key books and charges once", () => {
    const ctx = makeCtx();
    const a = bookAirportRide(ctx, ride);
    const b = bookAirportRide(ctx, ride);
    expect(a.duplicate).toBe(false);
    expect(b.duplicate).toBe(true);
    expect(ctx.bokun.calls).toBe(1);
    expect(ctx.db.prepare("SELECT COUNT(*) n FROM bookings").get()).toEqual({ n: 1 });
  });

  it("puts booking, number and referral code on one HubSpot contact", () => {
    const ctx = makeCtx();
    bookAirportRide(ctx, { ...ride, referral_code: "maria7" });
    expect(ctx.hubspot.contacts.get(phone)).toMatchObject({ referral_code: "MARIA7", hotel: "Barcelo Bavaro", last_booking: "BK-1000" });
  });
});

describe("attribution", () => {
  it("first code wins per stay; later codes are ignored", () => {
    const ctx = makeCtx();
    bookAirportRide(ctx, { ...ride, referral_code: "FIRST1" });
    const second = recordReferral(ctx, 1, "SECOND2");
    expect(second).toMatchObject({ accepted: false, code: "FIRST1" });
  });

  it("the database refuses to overwrite a code even if app code tries", () => {
    const ctx = makeCtx();
    bookAirportRide(ctx, { ...ride, referral_code: "FIRST1" });
    expect(() => ctx.db.prepare("UPDATE stays SET referral_code = 'HACK' WHERE id = 1").run()).toThrow(/already set/);
  });
});

describe("WhatsApp 24-hour window", () => {
  it("free text is allowed inside the window, blocked after it", () => {
    const ctx = makeCtx();
    logInbound(ctx, phone, "hi");
    expect(sendToGuest(ctx, phone, { text: "Welcome!" })).toMatchObject({ sent: true, kind: "text" });
    ctx.setNow(new Date("2027-01-21T16:00:00Z")); // 25 hours later
    expect(() => sendToGuest(ctx, phone, { text: "Still there?" })).toThrow(/24-hour window/);
    expect(sendToGuest(ctx, phone, { template: "morning_checkin" })).toMatchObject({ kind: "template" });
  });

  it("only approved templates can be sent", () => {
    const ctx = makeCtx();
    expect(() => sendToGuest(ctx, phone, { template: "promo_blast" })).toThrow(/not approved/);
  });
});
