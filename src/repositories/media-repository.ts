// =========================================================================================================
// MEDIA REPOSITORY (v2)
// =========================================================================================================
// ONLY place with SQL for media_assets + media_variants.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { queryOne, queryAll, batch, execute, type DB } from '../db/client';
import type { MediaAssetRow, MediaVariantRow, PostRow, PostRatingRow } from '../db/schema';

// =========================================================================================================
// Types
// =========================================================================================================

export type InsertVariantStatementData = {
	mediaAssetId: MediaVariantRow['media_asset_id'];
	variantName: MediaVariantRow['variant_name'];
	objectKey: MediaVariantRow['object_key'];
	mimeType: MediaVariantRow['mime_type'];
	byteSize: MediaVariantRow['byte_size'];
	qualityClass: MediaVariantRow['quality_class'];
	visibility: MediaVariantRow['visibility'];
	createdAt: MediaVariantRow['created_at'];
};

export class MediaRepository {
	constructor(private readonly db: DB) {}

	findAssetByPostId(postId: number): Promise<MediaAssetRow | null> {
		return queryOne<MediaAssetRow>(this.db, 'SELECT * FROM media_assets WHERE post_id = ?', [postId]);
	}

	findAssetByChecksum(checksum: ArrayBuffer): Promise<MediaAssetRow | null> {
		return queryOne<MediaAssetRow>(this.db, 'SELECT * FROM media_assets WHERE checksum = ?', [checksum]);
	}

	findVariant(assetId: number, variantName: string): Promise<MediaVariantRow | null> {
		return queryOne<MediaVariantRow>(this.db, 'SELECT * FROM media_variants WHERE media_asset_id = ? AND variant_name = ?', [assetId, variantName]);
	}

	listVariantsByPostId(postId: number): Promise<MediaVariantRow[]> {
		return queryAll<MediaVariantRow>(this.db, 'SELECT mv.* FROM media_variants mv JOIN media_assets ma ON ma.id = mv.media_asset_id WHERE ma.post_id = ?', [postId]);
	}

	private buildInsertVariantStatement(row: InsertVariantStatementData): D1PreparedStatement {
		return this.db
			.prepare('INSERT INTO media_variants (media_asset_id, variant_name, object_key, mime_type, byte_size, quality_class, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
			.bind(row.mediaAssetId, row.variantName, row.objectKey, row.mimeType, row.byteSize, row.qualityClass, row.visibility, row.createdAt);
	}

	async markAssetDone(assetId: number): Promise<void> {
		await execute(this.db, "UPDATE media_assets SET processing_status='done' WHERE id=?", [assetId]);
	}

	async publishPost(postId: number, lowKey: string | null, medKey: string | null, now = Date.now()): Promise<void> {
		await batch(this.db, [
			this.db.prepare("UPDATE posts SET status='available', published_at=?, updated_at=? WHERE id=?").bind(now, now, postId),
			this.db
				.prepare("INSERT OR REPLACE INTO post_listing (post_id, public_id, media_type, status, low_variant_key, medium_variant_key, published_at, score) SELECT id, public_id, media_type, 'available', ?, ?, ?, score FROM posts WHERE id=?")
				.bind(lowKey, medKey, now, postId),
		]);
	}

	async publishPostWithExistingVariant(postId: number, assetId: number, lowKey: string, now = Date.now()): Promise<void> {
		await this.markAssetDone(assetId);
		await batch(this.db, [
			this.db.prepare("UPDATE posts SET status='available', published_at=?, updated_at=? WHERE id=?").bind(now, now, postId),
			this.db
				.prepare("INSERT OR REPLACE INTO post_listing (post_id, public_id, media_type, status, low_variant_key, published_at, score) SELECT id, public_id, media_type, 'available', ?, ?, score FROM posts WHERE id=?")
				.bind(lowKey, now, postId),
		]);
	}

	async insertVariantsAndPublish(assetId: number, postId: number, lowKey: string, medKey: string, previewData: string, byteSize: number, now = Date.now()): Promise<void> {
		await batch(this.db, [
			this.buildInsertVariantStatement({ mediaAssetId: assetId, variantName: 'low', objectKey: lowKey, mimeType: 'image/avif', byteSize, qualityClass: 'low', visibility: 'public', createdAt: now }),
			this.buildInsertVariantStatement({ mediaAssetId: assetId, variantName: 'medium', objectKey: medKey, mimeType: 'image/avif', byteSize, qualityClass: 'medium', visibility: 'public', createdAt: now }),
			this.db.prepare("UPDATE media_assets SET processing_status='done' WHERE id=?").bind(assetId),
			this.db.prepare("UPDATE posts SET status='available', published_at=?, updated_at=? WHERE id=?").bind(now, now, postId),
			this.db
				.prepare(
					"INSERT OR REPLACE INTO post_listing (post_id, public_id, media_type, status, low_variant_key, medium_variant_key, preview_data, published_at, score) SELECT id, public_id, media_type, 'available', ?, ?, ?, ?, score FROM posts WHERE id=?",
				)
				.bind(lowKey, medKey, previewData, now, postId),
		]);
	}

	async recalcScoreWithDecay(postId: number): Promise<void> {
		const rows = await queryAll<Pick<PostRatingRow, 'value'>>(this.db, 'SELECT value, created_at FROM post_ratings WHERE post_id = ?', [postId]);
		let score = rows.reduce((sum, row) => sum + row.value, 0);
		const post = await queryOne<Pick<PostRow, 'created_at'>>(this.db, 'SELECT created_at FROM posts WHERE id = ?', [postId]);
		if (post) score /= Math.pow((Date.now() - post.created_at) / 3600000 + 2, 0.3);
		const now = Date.now();
		await batch(this.db, [
			this.db.prepare('UPDATE posts SET score = ?, rating_count = ?, updated_at = ? WHERE id = ?').bind(score, rows.length, now, postId),
			this.db.prepare('UPDATE post_listing SET score = ?, rating_count = ? WHERE post_id = ?').bind(score, rows.length, postId),
		]);
	}

	recalcAllTagUsage() {
		return execute(this.db, "UPDATE tags SET usage_count = (SELECT COUNT(*) FROM post_tags pt JOIN posts p ON p.id = pt.post_id WHERE pt.tag_id = tags.id AND p.status = 'available'), updated_at = ?", [Date.now()]);
	}
}
