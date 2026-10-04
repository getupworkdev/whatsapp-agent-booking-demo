import { Ctx, ToolError } from "./context.js";
import { ensureGuest } from "./guests.js";

const DAY_MS = 24 * 60 * 60 * 1000;

// WhatsApp only allows free-form text within 24 hours of the guest's last message.
// Outside that window the only legal message is a pre-approved template.
export function windowOpen(ctx: Ctx, phone: string) {
  const g = ensureGuest(ctx, phone);
  const last = ctx.db.prepare(
    `SELECT at FROM messages WHERE guest_id = ? AND direction = 'in' ORDER BY at DESC LIMIT 1`,
  ).get(g.id) as { at: string } | undefined;
  if (!last) return false;
  return ctx.now().getTime() - new Date(last.at).getTime() < DAY_MS;
}

export function sendToGuest(ctx: Ctx, phone: string, msg: { text?: string; template?: string }) {
  const g = ensureGuest(ctx, phone);
  let kind: "text" | "template";
  let body: string;
  if (msg.template) {
    const t = ctx.templates[msg.template];
    if (!t) throw new ToolError(`template "${msg.template}" is not approved`);
    kind = "template"; body = t;
  } else if (msg.text) {
    if (!windowOpen(ctx, phone)) throw new ToolError("outside the 24-hour window: use an approved template");
    kind = "text"; body = msg.text;
  } else throw new ToolError("nothing to send");
  ctx.whatsapp.send(phone, kind, body);
  ctx.db.prepare(`INSERT INTO messages (guest_id, direction, kind, body, at) VALUES (?, 'out', ?, ?, ?)`)
    .run(g.id, kind, body, ctx.now().toISOString());
  return { sent: true, kind };
}
