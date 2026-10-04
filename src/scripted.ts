import type { Model } from "./agent.js";

// Deterministic stand-in for the model, used by tests and the offline demo.
// Each entry is what "the model" returns on that call.
export function scriptedModel(steps: any[]): Model & { calls: number } {
  let i = 0;
  const m = {
    calls: 0,
    async create() {
      m.calls++;
      const s = steps[i++];
      if (!s) throw new Error("script exhausted");
      return s;
    },
  };
  return m;
}

export const toolUse = (id: string, name: string, input: unknown) => ({
  content: [{ type: "tool_use", id, name, input }], stop_reason: "tool_use",
});
export const say = (text: string) => ({ content: [{ type: "text", text }], stop_reason: "end_turn" });
