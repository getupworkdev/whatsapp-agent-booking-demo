# whatsapp-agent-booking-demo

[![test](https://github.com/getupworkdev/whatsapp-agent-booking-demo/actions/workflows/test.yml/badge.svg)](https://github.com/getupworkdev/whatsapp-agent-booking-demo/actions/workflows/test.yml)

A small, runnable demo of a WhatsApp booking agent built the safe way: **the model decides what to say, deterministic tools decide what happens.** Anything that books, charges, attributes or pays out lives in code and in the database, where the model can't talk its way around it.

Stack: TypeScript, the Anthropic SDK (tool use), SQLite standing in for Postgres. Bokun, HubSpot and the WhatsApp provider are mocks.

```
Guest on WhatsApp
↓ message
Agent (model + tools)
↓ tool calls only for money and records
book_airport_ride / send_message   ← validate, dedupe, enforce rules
↓
Bokun booking + HubSpot contact + ledger
```

## What it shows

| Problem in production | How it's handled | Test |
|---|---|---|
| The model passes a plausible but wrong argument (last year's date, a half hotel name) | The tool validates and returns an error; the agent has to ask the guest. Nothing is booked | `tools.test.ts`, `agent.test.ts` |
| A retry or a repeated tool call books twice | Every booking carries an idempotency key with a `UNIQUE` constraint. Same key returns the same booking, one Bokun call | `tools.test.ts`, `agent.test.ts` |
| Referral attribution gets overwritten by a later link | First code wins per guest per stay. A database trigger refuses any change once set, even from code that bypasses the tool | `tools.test.ts` |
| Free-form messages sent outside WhatsApp's 24-hour window | `send_message` checks the guest's last inbound message. Outside 24 h only Meta-approved templates go out | `tools.test.ts` |
| The nightly payout job runs twice, or a booking is refunded after payout | Append-only ledger: `UNIQUE(booking_id, entry)` makes the job safe to rerun; a refund adds a reversing row. Update and delete are blocked by triggers | `payouts.test.ts` |

## Run it

```bash
npm install
npm test        # 12 tests
npm run demo    # offline walkthrough with a scripted model, no API key needed
```

`npm run demo` prints:

```
1) wrong year caught by the tool -> Just checking: did you mean January 25, 2027?
2) booked; retried call deduplicated -> Booked! Here's your payment link. | Bokun calls: 1
3) nightly payout: [ { seller_code: 'MARIA7', balance_cents: 450 } ] | rerun writes: 0
4) after refund: [ { seller_code: 'MARIA7', balance_cents: 0 } ]
```

To drive it with the real Claude API instead of the scripted model, set `ANTHROPIC_API_KEY` and `ANTHROPIC_MODEL` and pass `await claudeModel()` to `handleGuestMessage` (see `src/agent.ts`).

## Layout

```
src/db.ts               schema: idempotency keys, frozen referral codes, append-only ledger
src/tools/booking.ts    book_airport_ride: validation, idempotency, Bokun + HubSpot write
src/tools/attribution.ts  first code wins per stay
src/tools/messaging.ts  24-hour window guard, approved templates only
src/payouts.ts          nightly commission job, refunds as reversing entries
src/agent.ts            model -> tools -> model loop; tool errors returned as is_error
src/scripted.ts         deterministic model for tests and the offline demo
```

## What this does not prove

- Bokun, HubSpot and the WhatsApp provider are mocks. Real API shapes, webhooks, rate limits and Meta's business verification and template approval are not exercised here.
- SQLite stands in for Postgres. The same constraints and triggers carry over directly.
- The scripted model shows the control flow. Prompt quality, guardrail wording and content checks against an approved library are product work on top of this.
