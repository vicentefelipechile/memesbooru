import { Hono } from "hono";
import { logger } from "hono/logger";
import { cors } from "hono/cors";
import { authApp } from "./controllers/authController.js";
import { postApp } from "./controllers/postController.js";
import { tagApp } from "./controllers/tagController.js";
import { commentApp } from "./controllers/commentController.js";
import { interactionApp } from "./controllers/interactionController.js";
import { moderationApp } from "./controllers/moderationController.js";
import { handleQueue } from "./infrastructure/queues/processor.js";

type Env = Cloudflare.Env;

const app = new Hono<{ Bindings: Env }>();

app.use(logger());
app.use("/api/*", cors({ origin: "*", allowMethods: ["GET","POST","PUT","DELETE","OPTIONS"], allowHeaders: ["Content-Type","Authorization"] }));

// Health
app.get("/api/health", async (c) => {
  const db = (c.env as unknown as { DB: D1Database }).DB;
  let dbStatus: "ok" | "unconfigured" | "error" = "unconfigured";
  if (db) {
    try { await db.prepare("SELECT 1 as v").first(); dbStatus = "ok"; } catch { dbStatus = "error"; }
  }
  return c.json({ status: "ok", version: "0.1.0", db: dbStatus });
});

// Rutas API — Hono delega a Controllers -> Services -> Repositories (PLAN 5)
app.route("/api/auth", authApp);
app.route("/api/posts", postApp);
app.route("/api/tags", tagApp);
app.route("/api/comments", commentApp);
app.route("/api", interactionApp);
app.route("/api/moderation", moderationApp);

// 404 API
app.notFound((c) => {
  if (c.req.path.startsWith("/api/")) return c.json({ error: "Not found", path: c.req.path }, 404);
  return c.text("Not found", 404);
});

app.onError((err, c) => {
  console.error(err);
  const status = (err as unknown as { statusCode?: number }).statusCode ?? 500;
  return c.json({ error: err.message, code: (err as unknown as { code?: string }).code ?? "INTERNAL_ERROR" }, status as never);
});

export default {
  fetch: app.fetch,
  async queue(batch: MessageBatch<unknown>, env: Env) {
    // Queue consumer — Fase 5/6 idempotente
    await handleQueue(batch, env as unknown as Cloudflare.Env & { DB: D1Database; MEDIA_BUCKET: R2Bucket; QUARANTINE_BUCKET: R2Bucket });
  },
  async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
    // Cron para cleanup y recalculos periodicos (Fase 6/8)
    const db = (env as unknown as { DB: D1Database }).DB;
    if (db) {
      await db.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(Date.now()).run();
      // Recalcular scores cada hora para posts con votos recientes
      const recent = await db.prepare("SELECT DISTINCT post_id FROM post_ratings WHERE updated_at > ? LIMIT 100").bind(Date.now() - 3600_000).all<{ post_id: number }>();
      for (const r of recent.results ?? []) {
        const vals = await db.prepare("SELECT value FROM post_ratings WHERE post_id = ?").bind(r.post_id).all<{ value: number }>();
        const score = (vals.results ?? []).reduce((s, x) => s + x.value, 0);
        await db.prepare("UPDATE posts SET score = ? WHERE id = ?").bind(score, r.post_id).run();
        await db.prepare("UPDATE post_listing SET score = ? WHERE post_id = ?").bind(score, r.post_id).run();
      }
    }
  },
};
