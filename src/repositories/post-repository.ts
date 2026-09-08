// =========================================================================================================
// POST REPOSITORY (v2)
// =========================================================================================================
// ONLY place with SQL for posts + post_listing + media_assets/variants + post_tags.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { queryOne, queryAll, batch, execute, type DB } from '../db/client';
import type { PostRow, PostListingRow, MediaAssetRow, PostDetailRow, PostTagRow, PostRatingRow, UserActivityRow, NextIdRow } from '../db/schema';
import { encodeCursor as encodeCursorHelper, decodeCursor as decodeCursorHelper } from '../helpers/cursor';
import { normalizeTag } from '../validators';
import * as tagRepo from './tag-repository';
import { buildInsertPostStatement, buildInsertMediaAssetStatement } from './post-types';
import type { CreatePostData } from './post-types';

// =========================================================================================================
// Export — canonical cursor helpers (single source in helpers/cursor.ts) + split modules for compat
// =========================================================================================================

export const encodeCursor = encodeCursorHelper;
export const decodeCursor = decodeCursorHelper;
export type { CreatePostData, InsertPostStatementData, InsertMediaAssetStatementData, SearchByTagsOpts, PostCountFilter } from './post-types';
export { buildInsertPostStatement, buildInsertMediaAssetStatement } from './post-types';
export { searchByTags, count, findRandomPublicId } from './post-search';

// =========================================================================================================
// Queries
// =========================================================================================================

export async function findByPublicId(db: DB, publicId: string): Promise<PostDetailRow | null> {
	return queryOne<PostDetailRow>(db, 'SELECT pl.*, p.author_id, p.title, p.description, p.canonical_post_id FROM post_listing pl JOIN posts p ON p.id = pl.post_id WHERE pl.public_id = ?', [publicId]);
}

export async function findPostById(db: DB, id: number): Promise<PostRow | null> {
	return queryOne<PostRow>(db, 'SELECT * FROM posts WHERE id = ?', [id]);
}

export async function findPublicIdById(db: DB, id: number): Promise<string | null> {
	const row = await queryOne<Pick<PostRow, 'public_id'>>(db, 'SELECT public_id FROM posts WHERE id = ?', [id]);
	return row?.public_id ?? null;
}

export async function findPostIdByPublicId(db: DB, publicId: string): Promise<number | null> {
	const row = await queryOne<Pick<PostRow, 'id'>>(db, 'SELECT id FROM posts WHERE public_id = ?', [publicId]);
	return row?.id ?? null;
}

export async function updateUserActivityOnUpload(db: DB, userId: number, now = Date.now()): Promise<void> {
	await execute(db, 'UPDATE user_activity SET last_upload_at = ?, updated_at = ? WHERE user_id = ?', [now, now, userId]);
}

export async function getLastUploadAt(db: DB, userId: number): Promise<number | null> {
	const row = await queryOne<Pick<UserActivityRow, 'last_upload_at'>>(db, 'SELECT last_upload_at FROM user_activity WHERE user_id = ?', [userId]);
	return row?.last_upload_at ?? null;
}

export async function recalcScoreForPosts(db: DB, postIds: number[]): Promise<void> {
	for (const postId of postIds) {
		const vals = await queryAll<Pick<PostRatingRow, 'value'>>(db, 'SELECT value FROM post_ratings WHERE post_id = ?', [postId]);
		const score = vals.reduce((s, x) => s + x.value, 0);

		await batch(db, [db.prepare('UPDATE posts SET score = ? WHERE id = ?').bind(score, postId), db.prepare('UPDATE post_listing SET score = ? WHERE post_id = ?').bind(score, postId)]);
	}
}

export async function findRecentlyRatedPostIds(db: DB, limit = 100): Promise<number[]> {
	const rows = await queryAll<Pick<PostTagRow, 'post_id'>>(db, 'SELECT DISTINCT post_id FROM post_ratings WHERE updated_at > ? LIMIT ?', [Date.now() - 3600_000, limit]);

	return rows.map((r) => r.post_id);
}

export async function upsertRating(db: DB, postId: number, userId: number, value: number): Promise<void> {
	const now = Date.now();

	await batch(db, [
		db
			.prepare('INSERT INTO post_ratings (post_id, user_id, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(post_id, user_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
			.bind(postId, userId, value, now, now),
		db.prepare('INSERT INTO jobs (job_type, entity_id, status, available_at, created_at) VALUES (?, ?, ?, ?, ?)').bind('recalculate_post_score', postId, 'pending', now + 60_000, now),
	]);
}

export async function addFavorite(db: DB, postId: number, userId: number): Promise<void> {
	const now = Date.now();

	await batch(db, [
		db.prepare('INSERT OR IGNORE INTO post_favorites (post_id, user_id, created_at) VALUES (?, ?, ?)').bind(postId, userId, now),
		db.prepare('UPDATE posts SET favorite_count = (SELECT COUNT(*) FROM post_favorites WHERE post_id = ?), updated_at = ? WHERE id = ?').bind(postId, now, postId),
		db.prepare('UPDATE post_listing SET favorite_count = (SELECT COUNT(*) FROM post_favorites WHERE post_id = ?) WHERE post_id = ?').bind(postId, postId),
	]);
}

export async function removeFavorite(db: DB, postId: number, userId: number): Promise<void> {
	const now = Date.now();

	await batch(db, [
		db.prepare('DELETE FROM post_favorites WHERE post_id = ? AND user_id = ?').bind(postId, userId),
		db.prepare('UPDATE posts SET favorite_count = (SELECT COUNT(*) FROM post_favorites WHERE post_id = ?), updated_at = ? WHERE id = ?').bind(postId, now, postId),
		db.prepare('UPDATE post_listing SET favorite_count = (SELECT COUNT(*) FROM post_favorites WHERE post_id = ?) WHERE post_id = ?').bind(postId, postId),
	]);
}

export async function listFavoritesByUser(db: DB, userId: number, limit = 50): Promise<PostListingRow[]> {
	return queryAll<PostListingRow>(db, 'SELECT pl.* FROM post_listing pl JOIN post_favorites pf ON pf.post_id = pl.post_id WHERE pf.user_id = ? ORDER BY pf.created_at DESC LIMIT ?', [userId, limit]);
}

// =========================================================================================================
// Commands
// =========================================================================================================

export function assertPostId(id: number): asserts id is import('../types').PostId {
	if (!Number.isInteger(id) || id < 1) throw new Error(`Invalid PostId: ${id}`);
}
export function isPostId(id: number): id is import('../types').PostId {
	return Number.isInteger(id) && id >= 1;
}

export async function createPost(db: DB, data: CreatePostData): Promise<PostRow['id']> {
	const normalized = data.tags.map(normalizeTag).filter(Boolean);
	const now = Date.now();

	const postId = (await queryOne<NextIdRow>(db, 'SELECT COALESCE(MAX(id),0)+1 as v FROM posts', []))?.v ?? 1;
	const mediaAssetId = (await queryOne<NextIdRow>(db, 'SELECT COALESCE(MAX(id),0)+1 as v FROM media_assets', []))?.v ?? 1;

	const dup = await queryOne<Pick<MediaAssetRow, 'post_id'>>(db, 'SELECT post_id FROM media_assets WHERE checksum = ?', [data.checksum]);
	const isDuplicate = !!dup;
	const status = isDuplicate ? 'duplicate' : 'processing';
	const canonical = dup?.post_id ?? null;

	const tagIds = await tagRepo.ensureTags(db, normalized, data.authorId);

	const stmts: D1PreparedStatement[] = [
		buildInsertPostStatement(db, {
			id: postId,
			publicId: data.publicId,
			authorId: data.authorId,
			canonicalPostId: canonical,
			mediaType: data.mediaType,
			status,
			title: data.title ?? null,
			createdAt: now,
			updatedAt: now,
		}),
		buildInsertMediaAssetStatement(db, {
			id: mediaAssetId,
			postId,
			mediaType: data.mediaType,
			originalKey: data.originalKey,
			mimeType: data.mediaType === 'video' ? 'video/mp4' : 'image/jpeg',
			checksum: data.checksum,
			processingStatus: isDuplicate ? 'done' : 'pending',
			createdAt: now,
		}),
	];

	for (const tid of tagIds) {
		stmts.push(db.prepare('INSERT INTO post_tags (post_id, tag_id, added_by, created_at) VALUES (?, ?, ?, ?)').bind(postId, tid, data.authorId, now));
	}

	if (!isDuplicate) {
		stmts.push(db.prepare('INSERT INTO jobs (job_type, entity_id, status, available_at, created_at) VALUES (?, ?, ?, ?, ?)').bind('process_media', postId, 'pending', now, now));
	}

	await batch(db, stmts);

	return postId;
}
