import * as d1 from "../infrastructure/d1/index.js";
import { normalizeTag } from "../../shared/validation/index.js";

export type PostListingRow = {
  post_id: number;
  public_id: string;
  media_type: string;
  status: string;
  low_variant_key: string;
  medium_variant_key: string | null;
  width: number | null;
  height: number | null;
  score: number;
  rating_count: number;
  favorite_count: number;
  comment_count: number;
  published_at: number;
};

// Cursor: base64(score|published_at + id)
export function encodeCursor(obj: { score?: number; published_at?: number; id: number }): string {
  return btoa(JSON.stringify(obj));
}
export function decodeCursor(c: string): { score?: number; published_at?: number; id: number } | null {
  try {
    return JSON.parse(atob(c));
  } catch {
    return null;
  }
}

export async function searchByTags(
  db: D1Database,
  tagIds: number[],
  opts: { sort: "recent" | "popular"; cursor?: string; limit: number },
): Promise<PostListingRow[]> {
  const limit = opts.limit;
  const cursor = opts.cursor ? decodeCursor(opts.cursor) : null;

  // Sin tags: grid reciente/popular directo sobre post_listing
  if (tagIds.length === 0) {
    if (opts.sort === "popular") {
      if (cursor?.score !== undefined) {
        return d1.all<PostListingRow>(
          db,
          `SELECT * FROM post_listing WHERE status='available' AND (score < ? OR (score = ? AND post_id < ?)) ORDER BY score DESC, post_id DESC LIMIT ?`,
          [cursor.score, cursor.score, cursor.id, limit],
        );
      }
      return d1.all<PostListingRow>(db, `SELECT * FROM post_listing WHERE status='available' ORDER BY score DESC, post_id DESC LIMIT ?`, [limit]);
    } else {
      if (cursor?.published_at !== undefined) {
        return d1.all<PostListingRow>(
          db,
          `SELECT * FROM post_listing WHERE status='available' AND (published_at < ? OR (published_at = ? AND post_id < ?)) ORDER BY published_at DESC, post_id DESC LIMIT ?`,
          [cursor.published_at, cursor.published_at, cursor.id, limit],
        );
      }
      return d1.all<PostListingRow>(db, `SELECT * FROM post_listing WHERE status='available' ORDER BY published_at DESC, post_id DESC LIMIT ?`, [limit]);
    }
  }

  // Con tags: empezar por el tag menos usado (ordenar tagIds por usage_count seria ideal — asumimos caller ya ordena)
  // Interseccion via IN + HAVING count = tagIds.length para AND exacto
  const placeholders = tagIds.map(() => "?").join(",");
  // Obtener candidatos post_ids que tienen TODOS los tags
  const candidateRows = await d1.all<{ post_id: number }>(
    db,
    `SELECT post_id FROM post_tags WHERE tag_id IN (${placeholders}) GROUP BY post_id HAVING COUNT(DISTINCT tag_id) = ? ORDER BY post_id DESC LIMIT 500`,
    [...tagIds, tagIds.length],
  );
  const ids = candidateRows.map((r) => r.post_id);
  if (ids.length === 0) return [];
  const idPlaceholders = ids.map(() => "?").join(",");
  const orderField = opts.sort === "popular" ? "score DESC, post_id DESC" : "published_at DESC, post_id DESC";
  let sql = `SELECT * FROM post_listing WHERE status='available' AND post_id IN (${idPlaceholders})`;
  const params: unknown[] = [...ids];
  if (cursor) {
    if (opts.sort === "popular" && cursor.score !== undefined) {
      sql += ` AND (score < ? OR (score = ? AND post_id < ?))`;
      params.push(cursor.score, cursor.score, cursor.id);
    } else if (cursor.published_at !== undefined) {
      sql += ` AND (published_at < ? OR (published_at = ? AND post_id < ?))`;
      params.push(cursor.published_at, cursor.published_at, cursor.id);
    }
  }
  sql += ` ORDER BY ${orderField} LIMIT ?`;
  params.push(limit);
  return d1.all<PostListingRow>(db, sql, params);
}

export async function findByPublicId(db: D1Database, publicId: string) {
  return d1.first<PostListingRow & { author_id: number; title: string | null; description: string | null; canonical_post_id: number | null }>(
    db,
    `SELECT pl.*, p.author_id, p.title, p.description, p.canonical_post_id FROM post_listing pl JOIN posts p ON p.id = pl.post_id WHERE pl.public_id = ?`,
    [publicId],
  );
}

export async function createPost(
  db: D1Database,
  data: {
    publicId: string;
    authorId: number;
    mediaType: string;
    tags: string[];
    title?: string | null;
    checksum: ArrayBuffer;
    originalKey: string;
  },
): Promise<number> {
  const now = Date.now();
  const postIdRow = await d1.first<{ v: number }>(db, "SELECT COALESCE(MAX(id),0)+1 as v FROM posts");
  const postId = postIdRow?.v ?? 1;
  // Duplicado exacto por checksum
  const dup = await d1.first<{ post_id: number }>(db, "SELECT post_id FROM media_assets WHERE checksum = ?", [data.checksum]);
  const isDuplicate = !!dup;
  const status = isDuplicate ? "duplicate" : "processing";
  const canonical = dup?.post_id ?? null;

  const mediaAssetId = await d1.first<{ v: number }>(db, "SELECT COALESCE(MAX(id),0)+1 as v FROM media_assets").then((r) => r?.v ?? 1);

  // Resolver tags a ids (crear si no existen)
  const normalized = data.tags.map(normalizeTag).filter(Boolean);
  const tagIds: number[] = [];
  for (const n of normalized) {
    let tag = await d1.first<{ id: number }>(db, "SELECT id FROM tags WHERE normalized_name = ?", [n]);
    if (!tag) {
      const newId = await d1.first<{ v: number }>(db, "SELECT COALESCE(MAX(id),0)+1 as v FROM tags").then((r) => r?.v ?? 1);
      await d1.run(db, "INSERT INTO tags (id, normalized_name, category, usage_count, status, created_by, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)", [
        newId,
        n,
        "general",
        0,
        "active",
        data.authorId,
        now,
        now,
      ]);
      tagIds.push(newId);
    } else tagIds.push(tag.id);
  }

  const stmts: D1PreparedStatement[] = [
    db.prepare("INSERT INTO posts (id, public_id, author_id, canonical_post_id, media_type, status, title, score, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(
      postId,
      data.publicId,
      data.authorId,
      canonical,
      data.mediaType,
      status,
      data.title ?? null,
      0,
      now,
      now,
    ),
    db.prepare("INSERT INTO media_assets (id, post_id, media_type, original_object_key, mime_type, byte_size, checksum, processing_status, created_at) VALUES (?,?,?,?,?,?,?,?,?)").bind(
      mediaAssetId,
      postId,
      data.mediaType,
      data.originalKey,
      data.mediaType === "video" ? "video/mp4" : "image/jpeg",
      0,
      data.checksum,
      isDuplicate ? "done" : "pending",
      now,
    ),
  ];
  for (const tid of tagIds) stmts.push(db.prepare("INSERT INTO post_tags (post_id, tag_id, added_by, created_at) VALUES (?,?,?,?)").bind(postId, tid, data.authorId, now));
  // post_listing solo si no es duplicado y tiene low (se creara via Queue)
  // Crear job
  if (!isDuplicate) stmts.push(db.prepare("INSERT INTO jobs (job_type, entity_id, status, available_at, created_at) VALUES ('process_media',?,?,?,?)").bind(postId, "pending", now, now));
  await db.batch(stmts);
  return postId;
}
