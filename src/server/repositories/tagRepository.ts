import * as d1 from "../infrastructure/d1/index.js";
import { normalizeTag } from "../../shared/validation/index.js";

export type TagRow = { id: number; normalized_name: string; display_name: string | null; category: string; usage_count: number; status: string };

export async function resolveTagIds(db: D1Database, inputs: string[]): Promise<number[]> {
  const normalized = inputs.map(normalizeTag).filter(Boolean);
  if (normalized.length === 0) return [];
  const placeholders = normalized.map(() => "?").join(",");
  const aliasRows = await d1.all<{ tag_id: number; alias_normalized: string }>(
    db,
    `SELECT tag_id, alias_normalized FROM tag_aliases WHERE alias_normalized IN (${placeholders})`,
    normalized,
  );
  const aliasMap = new Map(aliasRows.map((r) => [r.alias_normalized, r.tag_id]));
  const aliasIds = aliasRows.map((r) => r.tag_id);
  const remaining = normalized.filter((n) => !aliasMap.has(n));
  if (remaining.length === 0) return aliasIds;
  const tagPlaceholders = remaining.map(() => "?").join(",");
  const tags = await d1.all<TagRow>(db, `SELECT * FROM tags WHERE normalized_name IN (${tagPlaceholders})`, remaining);
  const directIds = tags.map((t) => t.id);
  return [...aliasIds, ...directIds];
}

export async function autocomplete(db: D1Database, prefix: string, limit = 20): Promise<TagRow[]> {
  const norm = normalizeTag(prefix);
  return d1.all<TagRow>(db, "SELECT * FROM tags WHERE normalized_name LIKE ? || '%' ORDER BY usage_count DESC, normalized_name ASC LIMIT ?", [
    norm,
    limit,
  ]);
}

export async function incrementUsage(db: D1Database, tagIds: number[]): Promise<void> {
  if (!tagIds.length) return;
  const stmts = tagIds.map((id) => db.prepare("UPDATE tags SET usage_count = usage_count + 1, updated_at = ? WHERE id = ?").bind(Date.now(), id));
  await db.batch(stmts);
}

export async function findByPostId(db: D1Database, postId: number): Promise<TagRow[]> {
  return d1.all<TagRow>(
    db,
    "SELECT t.* FROM tags t JOIN post_tags pt ON pt.tag_id = t.id WHERE pt.post_id = ? ORDER BY t.normalized_name",
    [postId],
  );
}
