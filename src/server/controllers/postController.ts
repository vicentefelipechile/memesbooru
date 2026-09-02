import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import * as postRepo from "../repositories/postRepository.js";
import * as tagRepo from "../repositories/tagRepository.js";
import { searchQuerySchema } from "../../shared/validation/index.js";
import * as ranking from "../services/rankingService.js";
import { getCookie } from "hono/cookie";
import * as auth from "../services/authService.js";

type Env = Cloudflare.Env;

async function getUserFromCookie(c: { req: unknown; env: Env }, db: D1Database) {
  const token = getCookie(c as never, "session");
  if (!token) return null;
  const sess = await auth.verifySession(db, token);
  if (!sess) return null;
  const user = await db.prepare("SELECT id, username, rank, status FROM users WHERE id = ?").bind(sess.userId).first<{ id: number; username: string; rank: string; status: string }>();
  return user;
}

export const postApp = new Hono<{ Bindings: Env }>();

postApp.get("/", zValidator("query", searchQuerySchema), async (c) => {
  const db = (c.env as unknown as { DB: D1Database }).DB;
  if (!db) return c.json({ data: [], nextCursor: null, hasMore: false, warning: "DB no configurado (dev)" }, 200);
  const { tags, sort, cursor, limit } = c.req.valid("query");
  const tagNames = tags ? tags.split(/\s+/).filter(Boolean) : [];
  const tagIds = tagNames.length ? await tagRepo.resolveTagIds(db, tagNames) : [];
  // Si se pidieron tags pero ninguno existe => vacio
  if (tagNames.length > 0 && tagIds.length === 0) return c.json({ data: [], nextCursor: null, hasMore: false });
  // Optimizacion: ordenar tagIds por usage_count asc (menos usado primero) — ya viene en orden? Lo ordenamos
  let sortedTagIds = tagIds;
  if (tagIds.length > 1) {
    const rows = await db.prepare(`SELECT id, usage_count FROM tags WHERE id IN (${tagIds.map(() => "?").join(",")})`).bind(...tagIds).all<{ id: number; usage_count: number }>();
    sortedTagIds = (rows.results ?? []).sort((a, b) => a.usage_count - b.usage_count).map((r) => r.id);
  }
  const rows = await postRepo.searchByTags(db, sortedTagIds, { sort: sort as never, cursor, limit });
  const nextCursor =
    rows.length === limit
      ? sort === "popular"
        ? postRepo.encodeCursor({ score: rows[rows.length - 1].score, id: rows[rows.length - 1].post_id })
        : postRepo.encodeCursor({ published_at: rows[rows.length - 1].published_at, id: rows[rows.length - 1].post_id })
      : null;
  return c.json({ data: rows, nextCursor, hasMore: !!nextCursor });
});

postApp.get("/:publicId", async (c) => {
  const db = (c.env as unknown as { DB: D1Database }).DB;
  const publicId = c.req.param("publicId");
  const row = await postRepo.findByPublicId(db, publicId);
  if (!row) return c.json({ error: "not found" }, 404);
  // Duplicado -> redirigir a canonico (PLAN 13)
  if (row.canonical_post_id) {
    const canon = await db.prepare("SELECT public_id FROM posts WHERE id = ?").bind(row.canonical_post_id).first<{ public_id: string }>();
    if (canon) return c.json({ redirectTo: canon.public_id, canonicalPostId: row.canonical_post_id }, 302);
  }
  // Verificar video solo para trusted (PLAN mutli)
  const token = getCookie(c, "session");
  let canSeeVideo = false;
  if (token) {
    const sess = await auth.verifySession(db, token);
    if (sess) {
      const u = await db.prepare("SELECT rank FROM users WHERE id = ?").bind(sess.userId).first<{ rank: string }>();
      canSeeVideo = u?.rank === "trusted";
    }
  }
  if (row.media_type === "video" && !canSeeVideo) {
    // No entregar variante, solo metadata sin URL
    return c.json({ ...row, lowVariantKey: null, mediumVariantKey: null, restricted: true });
  }
  const tags = await tagRepo.findByPostId(db, row.post_id);
  // Cache publica para posts available
  c.header("Cache-Control", "public, max-age=60, stale-while-revalidate=120");
  return c.json({ ...row, tags: tags.map((t) => t.normalized_name) });
});

postApp.post("/", zValidator("json", z.object({ title: z.string().max(120).optional(), tags: z.array(z.string()).min(1).max(20), mediaType: z.enum(["image","gif","video"]) })), async (c) => {
  const db = (c.env as unknown as { DB: D1Database }).DB;
  const body = c.req.valid("json");
  const user = await getUserFromCookie(c as never, db);
  if (!user) return c.json({ error: "login requerido" }, 401);
  if (user.status !== "active") return c.json({ error: "cuenta restringida" }, 403);
  const cooldown = await ranking.checkUploadCooldown(db, user.id, user.rank);
  if (!cooldown.allowed) return c.json({ error: "cooldown 1h para cuentas nuevas", retryAfter: cooldown.retryAfter }, 429);
  if (body.mediaType === "video" && user.rank !== "trusted") return c.json({ error: "videos solo para trusted" }, 403);

  // Para Fase 5 real se subiria a R2/quarantine. Aqui creamos placeholder con checksum random
  const publicId = Math.random().toString(36).slice(2, 8);
  const checksum = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(publicId + Date.now()));
  const originalKey = `media/${publicId}/original`;
  const postId = await postRepo.createPost(db, {
    publicId,
    authorId: user.id,
    mediaType: body.mediaType,
    tags: body.tags,
    title: body.title ?? null,
    checksum,
    originalKey,
  });
  await ranking.recordUpload(db, user.id);
  // Encolar a R2/Queue se hace via job process_media
  const queue = (c.env as unknown as { MEDIA_QUEUE: Queue }).MEDIA_QUEUE;
  if (queue) await queue.send({ type: "process_media", postId });
  return c.json({ publicId, postId, status: "processing" }, 201);
});

postApp.get("/:publicId/variants/:variant", async (c) => {
  // Entrega final desde R2 (Fase 5) — placeholder redirect a R2
  const variant = c.req.param("variant");
  const publicId = c.req.param("publicId");
  if (!["low","medium","original"].includes(variant)) return c.text("variant invalido", 400);
  if (variant === "original") {
    // Original solo con accion explicita — no cache, requiere auth?
    c.header("Cache-Control", "private, no-store");
  } else c.header("Cache-Control", "public, max-age=31536000, immutable");
  // En prod: firmar URL R2 o proxear bytes. Aqui devolvemos JSON placeholder
  return c.json({ message: `variante ${variant} para ${publicId} — integrar R2 en Fase 5`, key: `media/${publicId}/${variant}` });
});
