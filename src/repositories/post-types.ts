// =========================================================================================================
// POST TYPES + STATEMENTS (v2)
// =========================================================================================================
// Input types derived from Row via indexed access + builders for batch composition.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import type { DB } from '../db/client';
import type { PostRow, MediaAssetRow } from '../db/schema';

// =========================================================================================================
// Types
// =========================================================================================================

export type CreatePostData = {
	publicId: PostRow['public_id'];
	authorId: PostRow['author_id'];
	mediaType: PostRow['media_type'];
	tags: string[];
	title: PostRow['title'];
	checksum: MediaAssetRow['checksum'];
	originalKey: MediaAssetRow['original_object_key'];
};

export type InsertPostStatementData = {
	id: PostRow['id'];
	publicId: PostRow['public_id'];
	authorId: PostRow['author_id'];
	canonicalPostId: PostRow['canonical_post_id'];
	mediaType: PostRow['media_type'];
	status: PostRow['status'];
	title: PostRow['title'];
	createdAt: PostRow['created_at'];
	updatedAt: PostRow['updated_at'];
};

export type InsertMediaAssetStatementData = {
	id: MediaAssetRow['id'];
	postId: MediaAssetRow['post_id'];
	mediaType: MediaAssetRow['media_type'];
	originalKey: MediaAssetRow['original_object_key'];
	mimeType: MediaAssetRow['mime_type'];
	checksum: MediaAssetRow['checksum'];
	processingStatus: MediaAssetRow['processing_status'];
	createdAt: MediaAssetRow['created_at'];
};

export type SearchByTagsOpts = {
	sort: 'recent' | 'popular';
	cursor?: string;
	limit: number;
};

export type PostCountFilter = {
	status?: PostRow['status'];
};

// =========================================================================================================
// Builders
// =========================================================================================================

export function buildInsertPostStatement(db: DB, row: InsertPostStatementData): D1PreparedStatement {
	return db
		.prepare('INSERT INTO posts (id, public_id, author_id, canonical_post_id, media_type, status, title, score, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
		.bind(row.id, row.publicId, row.authorId, row.canonicalPostId, row.mediaType, row.status, row.title, 0, row.createdAt, row.updatedAt);
}

export function buildInsertMediaAssetStatement(db: DB, row: InsertMediaAssetStatementData): D1PreparedStatement {
	return db
		.prepare('INSERT INTO media_assets (id, post_id, media_type, original_object_key, mime_type, byte_size, checksum, processing_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
		.bind(row.id, row.postId, row.mediaType, row.originalKey, row.mimeType, 0, row.checksum, row.processingStatus, row.createdAt);
}
