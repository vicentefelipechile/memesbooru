import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { commentSchema } from "../../shared/validation/index.js";
import * as commentRepo from "../repositories/commentRepository.js";
import { getCookie } from "hono/cookie";
import * as auth from "../services/authService.js";
type Env = Cloudflare.Env;
export const commentApp = new Hono<{ Bindings: Env }>();
commentApp.get("/post/:publicId", async (c) => {
  const db = (c.env as unknown as { DB: D1Database }).DB;
  const publicId = c.req.param("publicId");
  const post = await db.prepare("SELECT id FROM posts WHERE public_id = ?").bind(publicId).first<{ id: number }>();
  if (!post) return c.json({ error: "post not found" }, 404);
  const cursor = c.req.query("cursor");
  const limit = Math.min(50, parseInt(c.req.query("limit") ?? "20", 10));
  const rows = await commentRepo.listByPost(db, post.id, cursor, limit);
  return c.json({ data: rows });
});
commentApp.post("/post/:publicId", zValidator("json", commentSchema), async (c) => {
  const db = (c.env as unknown as { DB: D1Database }).DB;
  const token = getCookie(c, "session");
  if (!token) return c.json({ error: "login requerido" }, 401);
  const sess = await auth.verifySession(db, token);
  if (!sess) return c.json({ error: "unauthorized" }, 401);
  const publicId = c.req.param("publicId");
  const post = await db.prepare("SELECT id FROM posts WHERE public_id = ?").bind(publicId).first<{ id: number }>();
  if (!post) return c.json({ error: "post not found" }, 404);
  const { body, parentId } = c.req.valid("json");
  // Rate limiting simple: 1 comentario /5s (en prod usar binding Rate Limit)
  const id = await commentRepo.create(db, { postId: post.id, authorId: sess.userId, body, parentId: parentId ?? null });
  return c.json({ id }, 201);
});
commentApp.delete("/:id", async (c) => {
  const db = (c.env as unknown as { DB: D1Database }).DB;
  const token = getCookie(c, "session");
  if (!token) return c.json({ error: "unauthorized" }, 401);
  const sess = await auth.verifySession(db, token);
  if (!sess) return c.json({ error: "unauthorized" }, 401);
  const id = parseInt(c.req.param("id"), 10);
  const isMod = await db.prepare("SELECT rank FROM users WHERE id = ?").bind(sess.userId).first<{ rank: string }>().then((r) => r?.rank === "trusted");
  await commentRepo.softDelete(db, id, sess.userId, !!isMod);
  return c.json({ ok: true });
});
