import { Hono } from "hono";
import { getCookie } from "hono/cookie";
import * as auth from "../services/authService.js";
type Env = Cloudflare.Env;
async function requireTrusted(c: never, db: D1Database) {
  const token = getCookie(c, "session");
  if (!token) throw new Error("unauthorized");
  const sess = await auth.verifySession(db, token);
  if (!sess) throw new Error("unauthorized");
  const u = await db.prepare("SELECT rank FROM users WHERE id = ?").bind(sess.userId).first<{ rank: string }>();
  if (u?.rank !== "trusted" && u?.rank !== "banned") {
    // En Fase 7 solo trusted puede moderar; admin es trusted
    const isTrusted = u?.rank === "trusted";
    if (!isTrusted) throw new Error("forbidden");
  }
  return sess;
}
export const moderationApp = new Hono<{ Bindings: Env }>();
moderationApp.post("/reports", async (c) => {
  const db = (c.env as unknown as { DB: D1Database }).DB;
  const token = getCookie(c, "session");
  if (!token) return c.json({ error: "login" }, 401);
  const sess = await auth.verifySession(db, token);
  if (!sess) return c.json({ error: "unauthorized" }, 401);
  const { targetType, targetId, reason } = await c.req.json<{ targetType: string; targetId: number; reason: string }>();
  if (!["post","comment","user","tag"].includes(targetType) || !reason) return c.json({ error: "bad request" }, 400);
  const now = Date.now();
  const id = await db.prepare("SELECT COALESCE(MAX(id),0)+1 as v FROM reports").first<{ v: number }>().then((r) => r?.v ?? 1);
  await db.prepare("INSERT INTO reports (id, reporter_id, target_type, target_id, reason, status, created_at) VALUES (?,?,?,?,?,?,?)").bind(id, sess.userId, targetType, targetId, reason, "open", now).run();
  return c.json({ id }, 201);
});
moderationApp.post("/actions", async (c) => {
  const db = (c.env as unknown as { DB: D1Database }).DB;
  let sess: { userId: number };
  try { sess = await requireTrusted(c as never, db); } catch (e: unknown) { const msg = (e as Error).message; return c.json({ error: msg }, msg === "forbidden" ? 403 : 401); }
  const { targetType, targetId, action, reason } = await c.req.json<{ targetType: string; targetId: number; action: string; reason?: string }>();
  const allowed = ["hide","reject","ban","restrict","approve"];
  if (!allowed.includes(action)) return c.json({ error: "accion no permitida" }, 400);
  const now = Date.now();
  const id = await db.prepare("SELECT COALESCE(MAX(id),0)+1 as v FROM moderation_actions").first<{ v: number }>().then((r) => r?.v ?? 1);
  await db.batch([
    db.prepare("INSERT INTO moderation_actions (id, target_type, target_id, moderator_id, action, reason, created_at) VALUES (?,?,?,?,?,?,?)").bind(id, targetType, targetId, sess.userId, action, reason ?? null, now),
    ...(targetType === "post" && action === "hide" ? [db.prepare("UPDATE posts SET status='hidden', updated_at=? WHERE id=?").bind(now, targetId), db.prepare("UPDATE post_listing SET status='hidden' WHERE post_id=?").bind(targetId)] : []),
    ...(targetType === "post" && action === "reject" ? [db.prepare("UPDATE posts SET status='rejected', updated_at=? WHERE id=?").bind(now, targetId)] : []),
    ...(targetType === "user" && action === "ban" ? [db.prepare("UPDATE users SET status='banned', rank='banned' WHERE id=?").bind(targetId)] : []),
  ]);
  return c.json({ ok: true, id });
});
moderationApp.get("/reports", async (c) => {
  const db = (c.env as unknown as { DB: D1Database }).DB;
  try { await requireTrusted(c as never, db); } catch (e: unknown) { const msg = (e as Error).message; return c.json({ error: msg }, msg === "forbidden" ? 403 : 401); }
  const rows = await db.prepare("SELECT * FROM reports WHERE status='open' ORDER BY created_at DESC LIMIT 50").all();
  return c.json({ data: rows.results });
});
