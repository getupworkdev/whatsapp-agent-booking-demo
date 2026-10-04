import { makeCtx } from "./setup.js";
import { handleGuestMessage } from "./agent.js";
import { scriptedModel, toolUse, say } from "./scripted.js";
import { runNightlyPayout, refundBooking } from "./payouts.js";

// Offline walkthrough with a scripted model: no API keys needed.
const ctx = makeCtx();
const phone = "+18095550101";
const model = scriptedModel([
  toolUse("t1", "book_airport_ride", { hotel: "Hard Rock Punta Cana", party_size: 4, arrival_date: "2026-01-25", referral_code: "MARIA7", idempotency_key: "ride-+18095550101-1" }),
  say("Just checking: did you mean January 25, 2027?"),
  toolUse("t2", "book_airport_ride", { hotel: "Hard Rock Punta Cana", party_size: 4, arrival_date: "2027-01-25", referral_code: "MARIA7", idempotency_key: "ride-+18095550101-1" }),
  toolUse("t3", "book_airport_ride", { hotel: "Hard Rock Punta Cana", party_size: 4, arrival_date: "2027-01-25", referral_code: "MARIA7", idempotency_key: "ride-+18095550101-1" }),
  say("Booked! Here's your payment link."),
]);

const t1 = await handleGuestMessage(ctx, model, phone, [], "Hi! 4 of us, Hard Rock, landing Jan 25");
console.log("1) wrong year caught by the tool ->", t1.reply);
const t2 = await handleGuestMessage(ctx, model, phone, t1.messages, "Yes, 2027");
console.log("2) booked; retried call deduplicated ->", t2.reply, "| Bokun calls:", ctx.bokun.calls);
console.log("   HubSpot contact:", ctx.hubspot.contacts.get(phone));

ctx.db.prepare(`UPDATE bookings SET status = 'attended'`).run();
console.log("3) nightly payout:", runNightlyPayout(ctx).payoutFile, "| rerun writes:", runNightlyPayout(ctx).written);
refundBooking(ctx, 1);
console.log("4) after refund:", runNightlyPayout(ctx).payoutFile);
