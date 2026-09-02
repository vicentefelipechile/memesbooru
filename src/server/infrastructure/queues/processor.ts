// Queue processor — idempotente (PLAN 14)
// Jobs: process_media, recalculate_post_score, update_tag_usage, aggregate_counters, cleanup_expired_sessions

export async function handleQueue(batch: MessageBatch<unknown>, env: Cloudflare.Env & { DB: D1Database; MEDIA_BUCKET: R2Bucket; QUARANTINE_BUCKET: R2Bucket }): Promise<void> {
  for (const msg of batch.messages) {
    const body = msg.body as { type: string; postId?: number; entityId?: number };
    try {
      if (body.type === "process_media" && body.postId) {
        await processMedia(env, body.postId);
      } else if (body.type === "recalculate_post_score" && body.postId) {
        await recalcScore(env.DB, body.postId);
      } else if (body.type === "update_tag_usage") {
        await updateTagUsage(env.DB);
      } else if (body.type === "cleanup_expired_sessions") {
        await env.DB.prepare("DELETE FROM sessions WHERE expires_at < ?").bind(Date.now()).run();
      }
      msg.ack();
    } catch (e) {
      // No ack -> retry + DLQ tras max_retries (wrangler.jsonc: 5)
      console.error("queue job failed", body, e);
      msg.retry();
    }
  }
}

async function processMedia(env: Cloudflare.Env & { DB: D1Database; MEDIA_BUCKET: R2Bucket; QUARANTINE_BUCKET: R2Bucket }, postId: number): Promise<void> {
  const db = env.DB;
  const asset = await db.prepare("SELECT * FROM media_assets WHERE post_id = ?").bind(postId).first<{ id: number; original_object_key: string; media_type: string; checksum: Uint8Array }>();
  if (!asset) return;
  // Idempotencia: si ya existe variante low, no regenerar
  const existing = await db.prepare("SELECT id FROM media_variants WHERE media_asset_id = ? AND variant_name='low'").bind(asset.id).first();
  if (existing) {
    await db.prepare("UPDATE media_assets SET processing_status='done' WHERE id=?").bind(asset.id).run();
    await db.prepare("UPDATE posts SET status='available', published_at=?, updated_at=? WHERE id=?").bind(Date.now(), Date.now(), postId).run();
    await db.prepare("INSERT OR REPLACE INTO post_listing (post_id, public_id, media_type, status, low_variant_key, published_at, score) SELECT id, public_id, media_type, 'available', ?, ?, score FROM posts WHERE id=?")
      .bind(`media/${postId}/low.avif`, Date.now(), postId).run();
    return;
  }
  // Pseudo procesamiento: copiar original a low/medium (en prod usar Images/Stream)
  // Aqui generamos objetos ficticios de 10KB
  const lowKey = `media/${asset.checksum ? Array.from(new Uint8Array(asset.checksum.slice(0, 4))).map((b) => b.toString(16).padStart(2, "0")).join("") : postId}/low.avif`;
  const medKey = `media/${postId}/medium.avif`;
  // R2 put (idempotente por key basada en checksum)
  const dummy = new Uint8Array(10 * 1024);
  await env.MEDIA_BUCKET.put(lowKey, dummy, { httpMetadata: { contentType: "image/avif" } });
  await env.MEDIA_BUCKET.put(medKey, dummy, { httpMetadata: { contentType: "image/avif" } });
  const now = Date.now();
  await db.batch([
    db.prepare("INSERT INTO media_variants (media_asset_id, variant_name, object_key, mime_type, byte_size, quality_class, visibility, created_at) VALUES (?,?,?,?,?,?,?,?)").bind(asset.id, "low", lowKey, "image/avif", dummy.length, "low", "public", now),
    db.prepare("INSERT INTO media_variants (media_asset_id, variant_name, object_key, mime_type, byte_size, quality_class, visibility, created_at) VALUES (?,?,?,?,?,?,?,?)").bind(asset.id, "medium", medKey, "image/avif", dummy.length, "medium", "public", now),
    db.prepare("UPDATE media_assets SET processing_status='done' WHERE id=?").bind(asset.id),
    db.prepare("UPDATE posts SET status='available', published_at=?, updated_at=? WHERE id=?").bind(now, now, postId),
    db.prepare("INSERT OR REPLACE INTO post_listing (post_id, public_id, media_type, status, low_variant_key, medium_variant_key, published_at, score) SELECT id, public_id, media_type, 'available', ?, ?, ?, score FROM posts WHERE id=?").bind(lowKey, medKey, now, postId),
  ]);
}

async function recalcScore(db: D1Database, postId: number): Promise<void> {
  // Score = sum(value) con decaimiento temporal simple
  const rows = await db.prepare("SELECT value, created_at FROM post_ratings WHERE post_id = ?").bind(postId).all<{ value: number; created_at: number }>();
  const ratings = rows.results ?? [];
  let score = ratings.reduce((s, r) => s + r.value, 0);
  // Aplicar penalizacion leve por edad
  const post = await db.prepare("SELECT created_at FROM posts WHERE id = ?").bind(postId).first<{ created_at: number }>();
  if (post) {
    const hours = (Date.now() - post.created_at) / 3600000;
    score = score / Math.pow(hours + 2, 0.3);
  }
  const now = Date.now();
  await db.batch([
    db.prepare("UPDATE posts SET score = ?, rating_count = ?, updated_at = ? WHERE id = ?").bind(score, ratings.length, now, postId),
    db.prepare("UPDATE post_listing SET score = ?, rating_count = ? WHERE post_id = ?").bind(score, ratings.length, postId),
  ]);
}
async function updateTagUsage(db: D1Database): Promise<void> {
  await db.prepare("UPDATE tags SET usage_count = (SELECT COUNT(*) FROM post_tags WHERE tag_id = tags.id), updated_at = ?").bind(Date.now()).run();
}
