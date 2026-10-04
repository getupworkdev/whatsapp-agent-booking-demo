import { describe, it, expect } from "vitest";
import { makeCtx } from "../src/setup.js";
import { bookAirportRide } from "../src/tools/booking.js";
import { runNightlyPayout, refundBooking } from "../src/payouts.js";

const base = { phone: "+18095550101", hotel: "Barcelo Bavaro", party_size: 2, arrival_date: "2027-02-03", referral_code: "MARIA7" };

describe("nightly payout ledger", () => {
  it("pays commission once per attended booking, even if the job runs twice", () => {
    const ctx = makeCtx();
    bookAirportRide(ctx, { ...base, idempotency_key: "ride-key-0001" });
    ctx.db.prepare("UPDATE bookings SET status = 'attended'").run();
    expect(runNightlyPayout(ctx).written).toBe(1);
    expect(runNightlyPayout(ctx).written).toBe(0);
    expect(runNightlyPayout(ctx).payoutFile).toEqual([{ seller_code: "MARIA7", balance_cents: 450 }]);
  });

  it("does not pay on bookings that weren't attended", () => {
    const ctx = makeCtx();
    bookAirportRide(ctx, { ...base, idempotency_key: "ride-key-0002" });
    expect(runNightlyPayout(ctx).written).toBe(0);
  });

  it("a refund adds a reversing entry; history is never edited", () => {
    const ctx = makeCtx();
    bookAirportRide(ctx, { ...base, idempotency_key: "ride-key-0003" });
    ctx.db.prepare("UPDATE bookings SET status = 'attended'").run();
    runNightlyPayout(ctx);
    refundBooking(ctx, 1);
    expect(ctx.bokun.refunds).toEqual(["BK-1000"]);
    expect(runNightlyPayout(ctx).payoutFile).toEqual([{ seller_code: "MARIA7", balance_cents: 0 }]);
    expect(() => ctx.db.prepare("UPDATE ledger SET amount_cents = 0").run()).toThrow(/append-only/);
    expect(() => ctx.db.prepare("DELETE FROM ledger").run()).toThrow(/append-only/);
  });
});
