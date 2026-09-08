// =========================================================================================================
// POST SEARCH (v2)
// =========================================================================================================
// Cursor-paginated search over post_listing. No OFFSET, no ORDER BY RANDOM().
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { queryOne, queryAll, type DB, type SqlParam } from '../db/client';
import type { PostRow, PostListingRow, PostTagRow, CountRow } from '../db/schema';
import { decodeCursor, type PostCursor } from '../helpers/cursor';
import type { SearchByTagsOpts, PostCountFilter } from './post-types';

// =========================================================================================================
// Export — types live in ./post-types (single source, re-exported here for compat)
// =========================================================================================================

export type { SearchByTagsOpts, PostCountFilter } from './post-types';

// =========================================================================================================
// Queries
// =========================================================================================================

export async function searchByTags(db: DB, tagIds: number[], opts: SearchByTagsOpts): Promise<PostListingRow[]> {
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

	const candidateRows = await queryAll<Pick<PostTagRow, 'post_id'>>(db, `SELECT post_id FROM post_tags WHERE tag_id IN (${placeholders}) GROUP BY post_id HAVING COUNT(DISTINCT tag_id) = ? ORDER BY post_id DESC LIMIT 500`, [
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

export async function count(db: DB, filters?: PostCountFilter): Promise<number> {
	if (filters?.status) {
		const row = await queryOne<CountRow>(db, 'SELECT COUNT(*) as c FROM posts WHERE status = ?', [filters.status]);

		return row?.c ?? 0;
	}

	const row = await queryOne<CountRow>(db, 'SELECT COUNT(*) as c FROM posts', []);

	return row?.c ?? 0;
}

// Deliberate single use of RANDOM() for /random — only ever returns 1 row, planner uses existing status index.
export async function findRandomPublicId(db: DB): Promise<string | null> {
	const row = await queryOne<Pick<PostRow, 'public_id'>>(db, `SELECT public_id FROM post_listing WHERE status = 'available' ORDER BY RANDOM() LIMIT 1`, []);
	return row?.public_id ?? null;
}
