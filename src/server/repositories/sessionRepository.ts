import * as d1 from "../infrastructure/d1/index.js";

export async function createSession(db: D1Database, userId: number, tokenHash: ArrayBuffer, expiresAt: number): Promise<void> {
  const now = Date.now();
  await d1.run(db, "INSERT INTO sessions (user_id, token_hash, created_at, expires_at, last_seen_at) VALUES (?,?,?,?,?)", [
    userId,
    tokenHash,
    now,
    expiresAt,
    now,
  ]);
}
export async function findByTokenHash(db: D1Database, hash: ArrayBuffer): Promise<{ user_id: number; expires_at: number; revoked_at: number | null } | null> {
  return d1.first(db, "SELECT user_id, expires_at, revoked_at FROM sessions WHERE token_hash = ?", [hash]);
}
export async function revokeSession(db: D1Database, hash: ArrayBuffer): Promise<void> {
  await d1.run(db, "UPDATE sessions SET revoked_at = ? WHERE token_hash = ?", [Date.now(), hash]);
}
export async function cleanupExpired(db: D1Database): Promise<number> {
  const res = await d1.run(db, "DELETE FROM sessions WHERE expires_at < ? OR revoked_at IS NOT NULL AND revoked_at < ?", [
    Date.now(),
    Date.now() - 30 * 24 * 3600 * 1000,
  ]);
  return res.meta.changes ?? 0;
}
