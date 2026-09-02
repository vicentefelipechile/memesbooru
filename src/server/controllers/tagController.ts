import { Hono } from "hono";
import * as tagRepo from "../repositories/tagRepository.js";
type Env = Cloudflare.Env;
export const tagApp = new Hono<{ Bindings: Env }>();
tagApp.get("/autocomplete", async (c) => {
  const db = (c.env as unknown as { DB: D1Database }).DB;
  const q = c.req.query("q") ?? "";
  if (!q) return c.json({ tags: [] });
  const tags = await tagRepo.autocomplete(db, q, 20);
  c.header("Cache-Control", "public, max-age=300");
  return c.json({ tags: tags.map((t) => ({ name: t.normalized_name, display: t.display_name, usage: t.usage_count })) });
});
tagApp.get("/:name", async (c) => {
  const db = (c.env as unknown as { DB: D1Database }).DB;
  const name = c.req.param("name");
  const tags = await tagRepo.autocomplete(db, name, 1);
  const t = tags.find((x) => x.normalized_name === name);
  if (!t) return c.json({ error: "not found" }, 404);
  return c.json(t);
});
