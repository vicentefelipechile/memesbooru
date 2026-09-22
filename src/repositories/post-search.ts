// =========================================================================================================
// Cursor-paginated search. Tag intersection and exclusion happen before ordering and limiting.
// =========================================================================================================

import { queryOne, queryAll, type DB } from '../db/client';
import type { PostRow, PostListingRow, CountRow } from '../db/schema';
import { decodeCursor, type PostCursor } from '../helpers/cursor';
import { QueryBuilder } from '../helpers/query-builder';
import type { SearchByTagsOpts, PostCountFilter } from './post-types';

export type { SearchByTagsOpts, PostCountFilter } from './post-types';

const LISTING_COLUMNS = `pl.post_id, pl.public_id, pl.media_type, pl.status, pl.low_variant_key,
	pl.medium_variant_key, pl.width, pl.height, pl.score, pl.rating_count, pl.favorite_count,
	pl.comment_count, pl.published_at`;

// =========================================================================================================
// Queries
// =========================================================================================================

export async function searchByTags(db: DB, tagIds: number[], opts: SearchByTagsOpts): Promise<PostListingRow[]> {
	const cursor = opts.cursor ? decodeCursor<PostCursor>(opts.cursor) : null;
	const query = new QueryBuilder().where("pl.status = 'available'");
	const [rarest, ...remaining] = tagIds;

	if (rarest !== undefined) query.where('pl.post_id IN (SELECT post_id FROM post_tags WHERE tag_id = ?)', rarest);

	for (const tagId of remaining) {
		query.where('EXISTS (SELECT 1 FROM post_tags pt WHERE pt.post_id = pl.post_id AND pt.tag_id = ?)', tagId);
	}

	for (const tagId of opts.excludedTagIds ?? []) {
		query.where('NOT EXISTS (SELECT 1 FROM post_tags pt WHERE pt.post_id = pl.post_id AND pt.tag_id = ?)', tagId);
	}

	const column = opts.sort === 'popular' ? 'score' : 'published_at';
	const value = cursor?.[column];

	if (cursor && value !== undefined) query.where(`(pl.${column} < ? OR (pl.${column} = ? AND pl.post_id < ?))`, value, value, cursor.id);

	const { sql, params } = query.build(`SELECT ${LISTING_COLUMNS} FROM post_listing pl`);

	return queryAll<PostListingRow>(db, `${sql} ORDER BY pl.${column} DESC, pl.post_id DESC LIMIT ?`, [...params, opts.limit]);
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
