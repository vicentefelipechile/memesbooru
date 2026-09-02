// =========================================================================================================
// MEDIA REPOSITORY (v2)
// =========================================================================================================
// ONLY place with SQL for media_assets + media_variants.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { queryOne, queryAll, batch, type DB } from '../db/client';
import type { MediaAssetRow, MediaVariantRow } from '../db/schema';

// =========================================================================================================
// Queries
// =========================================================================================================

export async function findAssetByPostId(db: DB, postId: number): Promise<MediaAssetRow | null> {
	return queryOne<MediaAssetRow>(db, 'SELECT * FROM media_assets WHERE post_id = ?', [postId]);
}

export async function findAssetByChecksum(db: DB, checksum: ArrayBuffer): Promise<MediaAssetRow | null> {
	return queryOne<MediaAssetRow>(db, 'SELECT * FROM media_assets WHERE checksum = ?', [checksum]);
}

export async function findVariant(db: DB, assetId: number, variantName: string): Promise<MediaVariantRow | null> {
	return queryOne<MediaVariantRow>(db, 'SELECT * FROM media_variants WHERE media_asset_id = ? AND variant_name = ?', [assetId, variantName]);
}

export async function listVariantsByPostId(db: DB, postId: number): Promise<MediaVariantRow[]> {
	return queryAll<MediaVariantRow>(db, 'SELECT mv.* FROM media_variants mv JOIN media_assets ma ON ma.id = mv.media_asset_id WHERE ma.post_id = ?', [postId]);
}

// =========================================================================================================
// Builders
// =========================================================================================================

export function buildInsertVariantStatement(
	db: DB,
	row: { mediaAssetId: number; variantName: string; objectKey: string; mimeType: string; byteSize: number; qualityClass: string; visibility: string; createdAt: number },
): D1PreparedStatement {
	return db
		.prepare('INSERT INTO media_variants (media_asset_id, variant_name, object_key, mime_type, byte_size, quality_class, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
		.bind(row.mediaAssetId, row.variantName, row.objectKey, row.mimeType, row.byteSize, row.qualityClass, row.visibility, row.createdAt);
}

export async function markAssetDone(db: DB, assetId: number): Promise<void> {
	await queryOne(db, "UPDATE media_assets SET processing_status='done' WHERE id=?", [assetId]);
}

export async function publishPost(db: DB, postId: number, lowKey: string | null, medKey: string | null, now = Date.now()): Promise<void> {
	await batch(db, [
		db.prepare("UPDATE posts SET status='available', published_at=?, updated_at=? WHERE id=?").bind(now, now, postId),
		db.prepare("INSERT OR REPLACE INTO post_listing (post_id, public_id, media_type, status, low_variant_key, medium_variant_key, published_at, score) SELECT id, public_id, media_type, 'available', ?, ?, ?, score FROM posts WHERE id=?").bind(lowKey, medKey, now, postId),
	]);
}

export async function publishPostWithExistingVariant(db: DB, postId: number, assetId: number, now = Date.now()): Promise<void> {
	await markAssetDone(db, assetId);
	await batch(db, [
		db.prepare("UPDATE posts SET status='available', published_at=?, updated_at=? WHERE id=?").bind(now, now, postId),
		db.prepare("INSERT OR REPLACE INTO post_listing (post_id, public_id, media_type, status, low_variant_key, published_at, score) SELECT id, public_id, media_type, 'available', ?, ?, score FROM posts WHERE id=?").bind(`media/${postId}/low.avif`, now, postId),
	]);
}

export async function insertVariantsAndPublish(
	db: DB,
	assetId: number,
	postId: number,
	lowKey: string,
	medKey: string,
	byteSize: number,
	now = Date.now(),
): Promise<void> {
	await batch(db, [
		buildInsertVariantStatement(db, { mediaAssetId: assetId, variantName: 'low', objectKey: lowKey, mimeType: 'image/avif', byteSize, qualityClass: 'low', visibility: 'public', createdAt: now }),
		buildInsertVariantStatement(db, { mediaAssetId: assetId, variantName: 'medium', objectKey: medKey, mimeType: 'image/avif', byteSize, qualityClass: 'medium', visibility: 'public', createdAt: now }),
		db.prepare("UPDATE media_assets SET processing_status='done' WHERE id=?").bind(assetId),
		db.prepare("UPDATE posts SET status='available', published_at=?, updated_at=? WHERE id=?").bind(now, now, postId),
		db.prepare("INSERT OR REPLACE INTO post_listing (post_id, public_id, media_type, status, low_variant_key, medium_variant_key, published_at, score) SELECT id, public_id, media_type, 'available', ?, ?, ?, score FROM posts WHERE id=?").bind(lowKey, medKey, now, postId),
	]);
}

export async function recalcScoreWithDecay(db: DB, postId: number): Promise<void> {
	const rows = await queryAll<{ value: number }>(db, 'SELECT value, created_at FROM post_ratings WHERE post_id = ?', [postId]);
	let score = rows.reduce((s, r) => s + (r as { value: number }).value, 0);
	const post = await queryOne<{ created_at: number }>(db, 'SELECT created_at FROM posts WHERE id = ?', [postId]);
	if (post) {
		const hours = (Date.now() - post.created_at) / 3600000;
		score = score / Math.pow(hours + 2, 0.3);
	}
	const now = Date.now();
	await batch(db, [
		db.prepare('UPDATE posts SET score = ?, rating_count = ?, updated_at = ? WHERE id = ?').bind(score, rows.length, now, postId),
		db.prepare('UPDATE post_listing SET score = ?, rating_count = ? WHERE post_id = ?').bind(score, rows.length, postId),
	]);
}

export async function recalcAllTagUsage(db: DB): Promise<void> {
	await queryOne(db, 'UPDATE tags SET usage_count = (SELECT COUNT(*) FROM post_tags WHERE tag_id = tags.id), updated_at = ?', [Date.now()]);
}
