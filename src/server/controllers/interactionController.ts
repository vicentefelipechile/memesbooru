import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { ratingSchema } from "../../shared/validation/index.js";
import { getCookie } from "hono/cookie";
import * as auth from "../services/authService.js";
type Env = Cloudflare.Env;
export const interactionApp = new Hono<{ Bindings: Env }>();

interactionApp.post("/post/:publicId/rating", zValidator("json", ratingSchema), async (c) => {
  const db = (c.env as unknown as { DB: D1Database }).DB;
  const token = getCookie(c, "session");
  if (!token) return c.json({ error: "login" }, 401);
  const sess = await auth.verifySession(db, token);
  if (!sess) return c.json({ error: "unauthorized" }, 401);
  const publicId = c.req.param("publicId");
  const post = await db.prepare("SELECT id FROM posts WHERE public_id = ?").bind(publicId).first<{ id: number }>();
  if (!post) return c.json({ error: "not found" }, 404);
  const { value } = c.req.valid("json");
  const now = Date.now();
  await db.prepare("INSERT INTO post_ratings (post_id, user_id, value, created_at, updated_at) VALUES (?,?,?,?,?) ON CONFLICT(post_id,user_id) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at").bind(post.id, sess.userId, value, now, now).run();
  // Encolar recalculo score por intervalos (PLAN 9) — no actualizar posts.score directo
  await db.prepare("INSERT INTO jobs (job_type, entity_id, status, available_at, created_at) VALUES ('recalculate_post_score',?,?,?,?)").bind(post.id, "pending", now + 60_000, now).run();
  const queue = (c.env as unknown as { MEDIA_QUEUE: Queue }).MEDIA_QUEUE;
  if (queue) await queue.send({ type: "recalculate_post_score", postId: post.id });
  return c.json({ ok: true });
});

interactionApp.post("/post/:publicId/favorite", async (c) => {
  const db = (c.env as unknown as { DB: D1Database }).DB;
  const token = getCookie(c, "session");
  if (!token) return c.json({ error: "login" }, 401);
  const sess = await auth.verifySession(db, token);
  if (!sess) return c.json({ error: "unauthorized" }, 401);
  const publicId = c.req.param("publicId");
  const post = await db.prepare("SELECT id FROM posts WHERE public_id = ?").bind(publicId).first<{ id: number }>();
  if (!post) return c.json({ error: "not found" }, 404);
  const now = Date.now();
  await db.batch([
    db.prepare("INSERT OR IGNORE INTO post_favorites (post_id, user_id, created_at) VALUES (?,?,?)").bind(post.id, sess.userId, now),
    db.prepare("UPDATE posts SET favorite_count = (SELECT COUNT(*) FROM post_favorites WHERE post_id = ?), updated_at = ? WHERE id = ?").bind(post.id, now, post.id),
    db.prepare("UPDATE post_listing SET favorite_count = (SELECT COUNT(*) FROM post_favorites WHERE post_id = ?) WHERE post_id = ?").bind(post.id, post.id),
  ]);
  return c.json({ ok: true });
});
interactionApp.delete("/post/:publicId/favorite", async (c) => {
  const db = (c.env as unknown as { DB: D1Database }).DB;
  const token = getCookie(c, "session");
  if (!token) return c.json({ error: "login" }, 401);
  const sess = await auth.verifySession(db, token);
  if (!sess) return c.json({ error: "unauthorized" }, 401);
  const publicId = c.req.param("publicId");
  const post = await db.prepare("SELECT id FROM posts WHERE public_id = ?").bind(publicId).first<{ id: number }>();
  if (!post) return c.json({ error: "not found" }, 404);
  const now = Date.now();
  await db.batch([
    db.prepare("DELETE FROM post_favorites WHERE post_id = ? AND user_id = ?").bind(post.id, sess.userId),
    db.prepare("UPDATE posts SET favorite_count = (SELECT COUNT(*) FROM post_favorites WHERE post_id = ?), updated_at = ? WHERE id = ?").bind(post.id, now, post.id),
    db.prepare("UPDATE post_listing SET favorite_count = (SELECT COUNT(*) FROM post_favorites WHERE post_id = ?) WHERE post_id = ?").bind(post.id, post.id),
  ]);
  return c.json({ ok: true });
});
interactionApp.get("/favorites", async (c) => {
  const db = (c.env as unknown as { DB: D1Database }).DB;
  const token = getCookie(c, "session");
  if (!token) return c.json({ error: "login" }, 401);
  const sess = await auth.verifySession(db, token);
  if (!sess) return c.json({ error: "unauthorized" }, 401);
  const rows = await db.prepare("SELECT pl.* FROM post_listing pl JOIN post_favorites pf ON pf.post_id = pl.post_id WHERE pf.user_id = ? ORDER BY pf.created_at DESC LIMIT 50").bind(sess.userId).all();
  return c.json({ data: rows.results });
});
