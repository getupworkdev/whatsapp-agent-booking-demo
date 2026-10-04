import { Ctx } from "./context.js";

// First code wins per guest per stay. Later codes are ignored, not overwritten.
// The database trigger enforces the same rule even if this function is bypassed.
export function recordReferral(ctx: Ctx, stayId: number, code: string) {
  const clean = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{3,16}$/.test(clean)) return { accepted: false, reason: "invalid code" };
  const res = ctx.db.prepare(
    `UPDATE stays SET referral_code = ?, code_locked_at = ? WHERE id = ? AND referral_code IS NULL`,
  ).run(clean, ctx.now().toISOString(), stayId);
  if (res.changes === 1) return { accepted: true, code: clean };
  const row = ctx.db.prepare(`SELECT referral_code FROM stays WHERE id = ?`).get(stayId) as { referral_code: string } | undefined;
  return { accepted: false, reason: "stay already attributed", code: row?.referral_code };
}
