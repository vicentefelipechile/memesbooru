import * as d1 from "../infrastructure/d1/index.js";

export async function listByPost(db: D1Database, postId: number, cursor?: string, limit = 20) {
  let cursorVal: { created_at: number; id: number } | null = null;
  if (cursor) try { cursorVal = JSON.parse(atob(cursor)); } catch {}
  if (cursorVal) {
    return d1.all(db, "SELECT * FROM comments WHERE post_id = ? AND status='visible' AND (created_at > ? OR (created_at = ? AND id > ?)) ORDER BY created_at ASC, id ASC LIMIT ?", [
      postId,
      cursorVal.created_at,
      cursorVal.created_at,
      cursorVal.id,
      limit,
    ]);
  }
  return d1.all(db, "SELECT * FROM comments WHERE post_id = ? AND status='visible' ORDER BY created_at ASC, id ASC LIMIT ?", [postId, limit]);
}
export async function create(db: D1Database, data: { postId: number; authorId: number; body: string; parentId?: number | null }) {
  const now = Date.now();
  void d1; // placeholder depth check removed
  // Validar profundidad max 3 (PLAN 19 pendiente) — limitamos a 3 niveles
  if (data.parentId) {
    const parent = await d1.first<{ id: number; parent_id: number | null }>(db, "SELECT id, parent_id FROM comments WHERE id = ?", [data.parentId]);
    if (!parent) throw new Error("parent not found");
    // contar profundidad
    let depth = 1;
    let cur: number | null = data.parentId;
    while (cur) {
      const row: { parent_id: number | null } | null = await d1.first<{ parent_id: number | null }>(db, "SELECT parent_id FROM comments WHERE id = ?", [cur]);
      if (!row?.parent_id) break;
      depth++; cur = row.parent_id;
      if (depth > 2) throw new Error("max depth exceeded");
    }
  }
  const idRow = await d1.first<{ v: number }>(db, "SELECT COALESCE(MAX(id),0)+1 as v FROM comments");
  const id = idRow?.v ?? 1;
  await db.batch([
    db.prepare("INSERT INTO comments (id, post_id, author_id, parent_id, body, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)").bind(id, data.postId, data.authorId, data.parentId ?? null, data.body, "visible", now, now),
    db.prepare("UPDATE posts SET comment_count = comment_count + 1, updated_at = ? WHERE id = ?").bind(now, data.postId),
    db.prepare("UPDATE post_listing SET comment_count = comment_count + 1 WHERE post_id = ?").bind(data.postId),
    db.prepare("UPDATE user_activity SET comments_count = comments_count + 1, last_comment_at = ?, updated_at = ? WHERE user_id = ?").bind(now, now, data.authorId),
  ]);
  return id;
}
export async function softDelete(db: D1Database, commentId: number, requesterId: number, isModerator: boolean) {
  const c = await d1.first<{ author_id: number }>(db, "SELECT author_id FROM comments WHERE id = ?", [commentId]);
  if (!c) throw new Error("not found");
  if (c.author_id !== requesterId && !isModerator) throw new Error("forbidden");
  await d1.run(db, "UPDATE comments SET status='hidden', deleted_at = ?, updated_at = ? WHERE id = ?", [Date.now(), Date.now(), commentId]);
}
