// Ranking — PLAN 11
export async function checkUploadCooldown(db: D1Database, userId: number, rank: string): Promise<{ allowed: boolean; retryAfter?: number }> {
  if (rank !== "new") return { allowed: true };
  const row = await db.prepare("SELECT last_upload_at FROM user_activity WHERE user_id = ?").bind(userId).first<{ last_upload_at: number | null }>();
  const last = row?.last_upload_at ?? 0;
  const elapsed = Date.now() - last;
  if (elapsed < 3600 * 1000) return { allowed: false, retryAfter: 3600 * 1000 - elapsed };
  return { allowed: true };
}
export async function recordUpload(db: D1Database, userId: number): Promise<void> {
  await db.prepare("UPDATE user_activity SET last_upload_at = ?, updated_at = ? WHERE user_id = ?").bind(Date.now(), Date.now(), userId).run();
}
export async function maybePromote(db: D1Database, userId: number): Promise<void> {
  // Umbrales provisionales (PLAN 19 pendiente): new -> normal tras 7 dias y 3 posts aprobados
  const activity = await db.prepare("SELECT * FROM user_activity WHERE user_id = ?").bind(userId).first<{ approved_posts: number }>();
  const user = await db.prepare("SELECT rank, created_at FROM users WHERE id = ?").bind(userId).first<{ rank: string; created_at: number }>();
  if (!user || !activity) return;
  if (user.rank === "new" && activity.approved_posts >= 3 && Date.now() - user.created_at > 7 * 24 * 3600 * 1000) {
    await db.batch([
      db.prepare("UPDATE users SET rank = 'normal' WHERE id = ?").bind(userId),
      db.prepare("INSERT INTO user_rank_history (user_id, previous_rank, new_rank, reason, created_at) VALUES (?,?,?,?,?)").bind(userId, "new", "normal", "auto-promote", Date.now()),
    ]);
  }
}
