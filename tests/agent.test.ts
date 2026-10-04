import { describe, it, expect } from "vitest";
import { makeCtx } from "../src/setup.js";
import { handleGuestMessage } from "../src/agent.js";
import { scriptedModel, toolUse, say } from "../src/scripted.js";

const phone = "+18095550101";

describe("agent loop", () => {
  it("a tool error goes back to the model, and nothing is booked", async () => {
    const ctx = makeCtx();
    const model = scriptedModel([
      toolUse("t1", "book_airport_ride", { hotel: "Hard Rock", party_size: 4, arrival_date: "2027-01-25", idempotency_key: "ride-key-0100" }),
      say("Which hotel exactly? We serve Barcelo Bavaro, Hard Rock Punta Cana and Paradisus Palma Real."),
    ]);
    const r = await handleGuestMessage(ctx, model, phone, [], "4 people, Hard Rock, Jan 25");
    expect(r.reply).toMatch(/Which hotel/);
    const toolResult = (r.messages[2].content as any[])[0];
    expect(toolResult.is_error).toBe(true);
    expect(ctx.bokun.calls).toBe(0);
  });

  it("books once even when the model repeats the tool call", async () => {
    const ctx = makeCtx();
    const input = { hotel: "Hard Rock Punta Cana", party_size: 4, arrival_date: "2027-01-25", referral_code: "MARIA7", idempotency_key: "ride-key-0101" };
    const model = scriptedModel([toolUse("t1", "book_airport_ride", input), toolUse("t2", "book_airport_ride", input), say("Booked!")]);
    await handleGuestMessage(ctx, model, phone, [], "Book it");
    expect(ctx.bokun.calls).toBe(1);
    expect(ctx.hubspot.contacts.get(phone)).toMatchObject({ referral_code: "MARIA7" });
  });
});
