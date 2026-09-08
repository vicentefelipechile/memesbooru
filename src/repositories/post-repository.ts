// =========================================================================================================
// POST REPOSITORY (v2)
// =========================================================================================================
// ONLY place with SQL for posts + post_listing + media_assets/variants + post_tags.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { queryOne, queryAll, batch, type DB, type SqlParam } from '../db/client';
import type { PostRow, PostListingRow, MediaAssetRow } from '../db/schema';
import { encodeCursor as encodeCursorHelper, decodeCursor as decodeCursorHelper, type PostCursor } from '../helpers/cursor';
import { normalizeTag } from '../validators';
import * as tagRepo from './tag-repository';

// =========================================================================================================
// Helpers — re-export canonical cursor helpers (single source in helpers/cursor.ts)
// =========================================================================================================

export const encodeCursor = encodeCursorHelper;
export const decodeCursor = decodeCursorHelper;

// =========================================================================================================
// Sorting whitelist (never interpolate user input)
// =========================================================================================================

const SORT_COLUMNS = {
	score: 'pl.score',
	published_at: 'pl.published_at',
	created_at: 'p.created_at',
} as const satisfies Record<string, string>;

// =========================================================================================================
// Queries
// =========================================================================================================

export async function findByPublicId(db: DB, publicId: string): Promise<(PostListingRow & { author_id: number; title: string | null; description: string | null; canonical_post_id: number | null }) | null> {
	return queryOne(db, 'SELECT pl.*, p.author_id, p.title, p.description, p.canonical_post_id FROM post_listing pl JOIN posts p ON p.id = pl.post_id WHERE pl.public_id = ?', [publicId]);
}

export async function findPostById(db: DB, id: number): Promise<PostRow | null> {
	return queryOne<PostRow>(db, 'SELECT * FROM posts WHERE id = ?', [id]);
}

export async function findPublicIdById(db: DB, id: number): Promise<string | null> {
	const row = await queryOne<{ public_id: string }>(db, 'SELECT public_id FROM posts WHERE id = ?', [id]);
	return row?.public_id ?? null;
}

export async function findPostIdByPublicId(db: DB, publicId: string): Promise<number | null> {
	const row = await queryOne<{ id: number }>(db, 'SELECT id FROM posts WHERE public_id = ?', [publicId]);
	return row?.id ?? null;
}

export async function updateUserActivityOnUpload(db: DB, userId: number, now = Date.now()): Promise<void> {
	await queryOne(db, 'UPDATE user_activity SET last_upload_at = ?, updated_at = ? WHERE user_id = ?', [now, now, userId]);
}

export async function getLastUploadAt(db: DB, userId: number): Promise<number | null> {
	const row = await queryOne<{ last_upload_at: number | null }>(db, 'SELECT last_upload_at FROM user_activity WHERE user_id = ?', [userId]);
	return row?.last_upload_at ?? null;
}

export async function recalcScoreForPosts(db: DB, postIds: number[]): Promise<void> {
	for (const postId of postIds) {
		const vals = await queryAll<{ value: number }>(db, 'SELECT value FROM post_ratings WHERE post_id = ?', [postId]);
		const score = vals.reduce((s, x) => s + x.value, 0);

		await batch(db, [db.prepare('UPDATE posts SET score = ? WHERE id = ?').bind(score, postId), db.prepare('UPDATE post_listing SET score = ? WHERE post_id = ?').bind(score, postId)]);
	}
}

export async function findRecentlyRatedPostIds(db: DB, limit = 100): Promise<number[]> {
	const rows = await queryAll<{ post_id: number }>(db, 'SELECT DISTINCT post_id FROM post_ratings WHERE updated_at > ? LIMIT ?', [Date.now() - 3600_000, limit]);

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

export async function searchByTags(db: DB, tagIds: number[], opts: { sort: 'recent' | 'popular'; cursor?: string; limit: number }): Promise<PostListingRow[]> {
	const cursor = opts.cursor ? decodeCursor<PostCursor>(opts.cursor) : null;

	if (tagIds.length === 0) return searchWithoutTags(db, opts.sort, cursor, opts.limit);

	const ids = await fetchCandidateIds(db, tagIds);

	if (ids.length === 0) return [];

	return searchWithTags(db, ids, opts.sort, cursor, opts.limit);
}

async function searchWithoutTags(db: DB, sort: 'recent' | 'popular', cursor: PostCursor | null, limit: number): Promise<PostListingRow[]> {
	if (sort === 'popular') {
		if (cursor?.score !== undefined) {
			return queryAll<PostListingRow>(db, `SELECT * FROM post_listing WHERE status = 'available' AND (score < ? OR (score = ? AND post_id < ?)) ORDER BY score DESC, post_id DESC LIMIT ?`, [cursor.score, cursor.score, cursor.id, limit]);
		}

		return queryAll<PostListingRow>(db, `SELECT * FROM post_listing WHERE status = 'available' ORDER BY score DESC, post_id DESC LIMIT ?`, [limit]);
	}

	if (cursor?.published_at !== undefined) {
		return queryAll<PostListingRow>(db, `SELECT * FROM post_listing WHERE status = 'available' AND (published_at < ? OR (published_at = ? AND post_id < ?)) ORDER BY published_at DESC, post_id DESC LIMIT ?`, [
			cursor.published_at,
			cursor.published_at,
			cursor.id,
			limit,
		]);
	}

	return queryAll<PostListingRow>(db, `SELECT * FROM post_listing WHERE status = 'available' ORDER BY published_at DESC, post_id DESC LIMIT ?`, [limit]);
}

async function fetchCandidateIds(db: DB, tagIds: number[]): Promise<number[]> {
	const placeholders = tagIds.map(() => '?').join(',');

	const candidateRows = await queryAll<{ post_id: number }>(db, `SELECT post_id FROM post_tags WHERE tag_id IN (${placeholders}) GROUP BY post_id HAVING COUNT(DISTINCT tag_id) = ? ORDER BY post_id DESC LIMIT 500`, [
		...tagIds,
		tagIds.length,
	]);

	return candidateRows.map((r) => r.post_id);
}

async function searchWithTags(db: DB, ids: number[], sort: 'recent' | 'popular', cursor: PostCursor | null, limit: number): Promise<PostListingRow[]> {
	const idPlaceholders = ids.map(() => '?').join(',');
	const orderColumn = sort === 'popular' ? 'score DESC, post_id DESC' : 'published_at DESC, post_id DESC';

	let sql = `SELECT * FROM post_listing WHERE status = 'available' AND post_id IN (${idPlaceholders})`;
	const params: SqlParam[] = [...ids];

	if (cursor) {
		if (sort === 'popular' && cursor.score !== undefined) {
			sql += ` AND (score < ? OR (score = ? AND post_id < ?))`;
			params.push(cursor.score, cursor.score, cursor.id);
		} else if (cursor.published_at !== undefined) {
			sql += ` AND (published_at < ? OR (published_at = ? AND post_id < ?))`;
			params.push(cursor.published_at, cursor.published_at, cursor.id);
		}
	}

	sql += ` ORDER BY ${orderColumn} LIMIT ?`;
	params.push(limit);

	return queryAll<PostListingRow>(db, sql, params);
}

export async function count(db: DB, filters?: { status?: string }): Promise<number> {
	if (filters?.status) {
		const row = await queryOne<{ c: number }>(db, 'SELECT COUNT(*) as c FROM posts WHERE status = ?', [filters.status]);

		return row?.c ?? 0;
	}

	const row = await queryOne<{ c: number }>(db, 'SELECT COUNT(*) as c FROM posts', []);

	return row?.c ?? 0;
}

// Deliberate single use of RANDOM() for /random — only ever returns 1 row, planner uses existing status index.
export async function findRandomPublicId(db: DB): Promise<string | null> {
	const row = await queryOne<{ public_id: string }>(db, `SELECT public_id FROM post_listing WHERE status = 'available' ORDER BY RANDOM() LIMIT 1`, []);
	return row?.public_id ?? null;
}

// =========================================================================================================
// Builders
// =========================================================================================================

export function buildInsertPostStatement(
	db: DB,
	row: {
		id: number;
		publicId: string;
		authorId: number;
		canonicalPostId: number | null;
		mediaType: string;
		status: string;
		title: string | null;
		createdAt: number;
		updatedAt: number;
	},
): D1PreparedStatement {
	return db
		.prepare('INSERT INTO posts (id, public_id, author_id, canonical_post_id, media_type, status, title, score, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
		.bind(row.id, row.publicId, row.authorId, row.canonicalPostId, row.mediaType, row.status, row.title, 0, row.createdAt, row.updatedAt);
}

export function buildInsertMediaAssetStatement(
	db: DB,
	row: {
		id: number;
		postId: number;
		mediaType: string;
		originalKey: string;
		mimeType: string;
		checksum: ArrayBuffer;
		processingStatus: string;
		createdAt: number;
	},
): D1PreparedStatement {
	return db
		.prepare('INSERT INTO media_assets (id, post_id, media_type, original_object_key, mime_type, byte_size, checksum, processing_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
		.bind(row.id, row.postId, row.mediaType, row.originalKey, row.mimeType, 0, row.checksum, row.processingStatus, row.createdAt);
}

// =========================================================================================================
// Repository input types — derive field types from Row / PostRow via indexed access
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

	const postId = (await queryOne<{ v: number }>(db, 'SELECT COALESCE(MAX(id),0)+1 as v FROM posts', []))?.v ?? 1;
	const mediaAssetId = (await queryOne<{ v: number }>(db, 'SELECT COALESCE(MAX(id),0)+1 as v FROM media_assets', []))?.v ?? 1;

	const dup = await queryOne<{ post_id: number }>(db, 'SELECT post_id FROM media_assets WHERE checksum = ?', [data.checksum]);
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
