import { Ctx, ToolError } from "./context.js";

const E164 = /^\+[1-9]\d{7,14}$/;

export function ensureGuest(ctx: Ctx, phone: string) {
  if (!E164.test(phone)) throw new ToolError(`phone must be E.164, got "${phone}"`);
  const now = ctx.now().toISOString();
  ctx.db.prepare(`INSERT INTO guests (phone, created_at) VALUES (?, ?) ON CONFLICT(phone) DO NOTHING`).run(phone, now);
  return ctx.db.prepare(`SELECT * FROM guests WHERE phone = ?`).get(phone) as { id: number; phone: string };
}

export function logInbound(ctx: Ctx, phone: string, body: string) {
  const g = ensureGuest(ctx, phone);
  ctx.db.prepare(`INSERT INTO messages (guest_id, direction, kind, body, at) VALUES (?, 'in', 'text', ?, ?)`)
    .run(g.id, body, ctx.now().toISOString());
}
