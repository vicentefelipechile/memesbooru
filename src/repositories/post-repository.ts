// =========================================================================================================
// POST REPOSITORY (v2)
// =========================================================================================================
// ONLY place with SQL for posts + post_listing + media_assets/variants + post_tags.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { queryOne, queryAll, batch, type DB } from '../db/client';
import type { PostRow, PostListingRow, MediaAssetRow } from '../db/schema';

// =========================================================================================================
// Helpers
// =========================================================================================================

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

// =========================================================================================================
// Sorting whitelist (never interpolate user input)
// =========================================================================================================

const SORT_COLUMNS: Record<string, string> = {
	score: 'pl.score',
	published_at: 'pl.published_at',
	created_at: 'p.created_at',
};

// =========================================================================================================
// Queries
// =========================================================================================================

export async function findByPublicId(db: DB, publicId: string): Promise<(PostListingRow & { author_id: number; title: string | null; description: string | null; canonical_post_id: number | null }) | null> {
	return queryOne(db, 'SELECT pl.*, p.author_id, p.title, p.description, p.canonical_post_id FROM post_listing pl JOIN posts p ON p.id = pl.post_id WHERE pl.public_id = ?', [publicId]);
}

export async function findPostById(db: DB, id: number): Promise<PostRow | null> {
	return queryOne<PostRow>(db, 'SELECT * FROM posts WHERE id = ?', [id]);
}

export async function searchByTags(db: DB, tagIds: number[], opts: { sort: 'recent' | 'popular'; cursor?: string; limit: number }): Promise<PostListingRow[]> {
	const limit = opts.limit;
	const cursor = opts.cursor ? decodeCursor(opts.cursor) : null;

	if (tagIds.length === 0) {
		if (opts.sort === 'popular') {
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

	const placeholders = tagIds.map(() => '?').join(',');
	const candidateRows = await queryAll<{ post_id: number }>(db, `SELECT post_id FROM post_tags WHERE tag_id IN (${placeholders}) GROUP BY post_id HAVING COUNT(DISTINCT tag_id) = ? ORDER BY post_id DESC LIMIT 500`, [
		...tagIds,
		tagIds.length,
	]);
	const ids = candidateRows.map((r) => r.post_id);
	if (ids.length === 0) return [];
	const idPlaceholders = ids.map(() => '?').join(',');
	const orderColumn = opts.sort === 'popular' ? 'score DESC, post_id DESC' : 'published_at DESC, post_id DESC';
	let sql = `SELECT * FROM post_listing WHERE status = 'available' AND post_id IN (${idPlaceholders})`;
	const params: unknown[] = [...ids];
	if (cursor) {
		if (opts.sort === 'popular' && cursor.score !== undefined) {
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

// =========================================================================================================
// Builders
// =========================================================================================================

export function buildInsertPostStatement(
	db: DB,
	row: { id: number; publicId: string; authorId: number; canonicalPostId: number | null; mediaType: string; status: string; title: string | null; createdAt: number; updatedAt: number },
): D1PreparedStatement {
	return db
		.prepare('INSERT INTO posts (id, public_id, author_id, canonical_post_id, media_type, status, title, score, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
		.bind(row.id, row.publicId, row.authorId, row.canonicalPostId, row.mediaType, row.status, row.title, 0, row.createdAt, row.updatedAt);
}

export function buildInsertMediaAssetStatement(db: DB, row: { id: number; postId: number; mediaType: string; originalKey: string; mimeType: string; checksum: ArrayBuffer; processingStatus: string; createdAt: number }): D1PreparedStatement {
	return db
		.prepare('INSERT INTO media_assets (id, post_id, media_type, original_object_key, mime_type, byte_size, checksum, processing_status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
		.bind(row.id, row.postId, row.mediaType, row.originalKey, row.mimeType, 0, row.checksum, row.processingStatus, row.createdAt);
}

// =========================================================================================================
// Commands
// =========================================================================================================

export async function createPost(db: DB, data: { publicId: string; authorId: number; mediaType: string; tags: string[]; title?: string | null; checksum: ArrayBuffer; originalKey: string }): Promise<number> {
	const { normalizeTag } = await import('../validators');
	const normalized = data.tags.map(normalizeTag).filter(Boolean);
	const now = Date.now();
	const postId = (await queryOne<{ v: number }>(db, 'SELECT COALESCE(MAX(id),0)+1 as v FROM posts', []))?.v ?? 1;
	const mediaAssetId = (await queryOne<{ v: number }>(db, 'SELECT COALESCE(MAX(id),0)+1 as v FROM media_assets', []))?.v ?? 1;
	const dup = await queryOne<{ post_id: number }>(db, 'SELECT post_id FROM media_assets WHERE checksum = ?', [data.checksum]);
	const isDuplicate = !!dup;
	const status = isDuplicate ? 'duplicate' : 'processing';
	const canonical = dup?.post_id ?? null;

	const tagIds: number[] = [];
	for (const n of normalized) {
		const existing = await queryOne<{ id: number }>(db, 'SELECT id FROM tags WHERE normalized_name = ?', [n]);
		if (existing) tagIds.push(existing.id);
		else {
			const nextTagId = (await queryOne<{ v: number }>(db, 'SELECT COALESCE(MAX(id),0)+1 as v FROM tags', []))?.v ?? 1;
			await batch(db, [
				db.prepare('INSERT INTO tags (id, normalized_name, category, usage_count, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(nextTagId, n, 'general', 0, 'active', data.authorId, now, now),
			]);
			tagIds.push(nextTagId);
		}
	}

	const stmts: D1PreparedStatement[] = [
		buildInsertPostStatement(db, { id: postId, publicId: data.publicId, authorId: data.authorId, canonicalPostId: canonical, mediaType: data.mediaType, status, title: data.title ?? null, createdAt: now, updatedAt: now }),
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
	for (const tid of tagIds) stmts.push(db.prepare('INSERT INTO post_tags (post_id, tag_id, added_by, created_at) VALUES (?, ?, ?, ?)').bind(postId, tid, data.authorId, now));
	if (!isDuplicate) stmts.push(db.prepare('INSERT INTO jobs (job_type, entity_id, status, available_at, created_at) VALUES (?, ?, ?, ?, ?)').bind('process_media', postId, 'pending', now, now));
	await batch(db, stmts);
	return postId;
}
