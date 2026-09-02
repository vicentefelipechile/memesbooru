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
