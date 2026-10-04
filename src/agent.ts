import type Anthropic from "@anthropic-ai/sdk";
import { Ctx, ToolError } from "./tools/context.js";
import { bookAirportRide } from "./tools/booking.js";
import { sendToGuest } from "./tools/messaging.js";
import { logInbound } from "./tools/guests.js";

type Block = Anthropic.Messages.ContentBlock;
type Param = Anthropic.Messages.MessageParam;

// Anything with the shape of anthropic.messages.create works here: the real
// client in production, a scripted model in tests.
export interface Model {
  create(p: { system: string; messages: Param[]; tools: Anthropic.Messages.Tool[] }): Promise<{ content: Block[]; stop_reason: string | null }>;
}

export const SYSTEM = `You are the concierge for guests arriving in Punta Cana.
Collect party size, hotel and arrival date, then book the airport ride with the book_airport_ride tool.
Never state a price, a booking or a payment unless a tool returned it. If a tool returns an error, fix it with the guest; do not guess.`;

export const TOOLS: Anthropic.Messages.Tool[] = [
  {
    name: "book_airport_ride",
    description: "Book and create a payment link for a private airport ride. Validates everything; returns an error you must resolve with the guest.",
    input_schema: {
      type: "object",
      properties: {
        hotel: { type: "string" },
        party_size: { type: "integer" },
        arrival_date: { type: "string", description: "YYYY-MM-DD" },
        referral_code: { type: "string" },
        idempotency_key: { type: "string", description: "Stable per booking intent; reuse it on retries" },
      },
      required: ["hotel", "party_size", "arrival_date", "idempotency_key"],
    },
  },
  {
    name: "send_message",
    description: "Send a WhatsApp message to the guest. Free text only inside the 24-hour window; otherwise pass an approved template name.",
    input_schema: {
      type: "object",
      properties: { text: { type: "string" }, template: { type: "string" } },
    },
  },
];

function runTool(ctx: Ctx, phone: string, name: string, input: any) {
  switch (name) {
    case "book_airport_ride": return bookAirportRide(ctx, { ...input, phone });
    case "send_message": return sendToGuest(ctx, phone, input);
    default: throw new ToolError(`unknown tool ${name}`);
  }
}

// One guest turn: log the inbound message, then loop model -> tools -> model
// until the model stops asking for tools. Tool errors go back to the model as
// is_error results, so it corrects course instead of the app crashing or guessing.
export async function handleGuestMessage(ctx: Ctx, model: Model, phone: string, history: Param[], text: string, maxSteps = 6) {
  logInbound(ctx, phone, text);
  const messages: Param[] = [...history, { role: "user", content: text }];
  for (let step = 0; step < maxSteps; step++) {
    const res = await model.create({ system: SYSTEM, messages, tools: TOOLS });
    messages.push({ role: "assistant", content: res.content });
    const uses = res.content.filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use");
    if (res.stop_reason !== "tool_use" || uses.length === 0) return { messages, reply: textOf(res.content) };
    const results: Anthropic.Messages.ToolResultBlockParam[] = uses.map((u) => {
      try {
        return { type: "tool_result", tool_use_id: u.id, content: JSON.stringify(runTool(ctx, phone, u.name, u.input)) };
      } catch (e) {
        if (e instanceof ToolError) return { type: "tool_result", tool_use_id: u.id, content: e.message, is_error: true };
        throw e;
      }
    });
    messages.push({ role: "user", content: results });
  }
  throw new Error("agent did not finish within maxSteps");
}

const textOf = (c: Block[]) => c.filter((b) => b.type === "text").map((b: any) => b.text).join("\n");

// Production model: the real Claude API. Model name comes from the environment.
export async function claudeModel(): Promise<Model> {
  const { default: AnthropicClient } = await import("@anthropic-ai/sdk");
  const client = new AnthropicClient();
  const model = process.env.ANTHROPIC_MODEL;
  if (!model) throw new Error("set ANTHROPIC_MODEL");
  return { create: (p) => client.messages.create({ model, max_tokens: 1024, ...p }) as any };
}
