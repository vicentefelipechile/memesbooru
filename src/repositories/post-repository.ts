// =========================================================================================================
// POST REPOSITORY (v2)
// =========================================================================================================
// ONLY place with SQL for posts + post_listing + media_assets/variants + post_tags.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { queryOne, queryAll, batch, execute, type DB } from '../db/client';
import type { FavoriteListingRow, PostRow, PostListingRow, MediaAssetRow, PostDetailRow, PostTagRow, PostRatingRow, UserActivityRow, NextIdRow } from '../db/schema';
import { encodeCursor as encodeCursorHelper, decodeCursor as decodeCursorHelper } from '../helpers/cursor';
import { normalizeTag } from '../validators';
import * as tagRepo from './tag-repository';
import { buildInsertPostStatement, buildInsertMediaAssetStatement } from './post-types';
import type { CreatePostData } from './post-types';
import { searchByTags, findRandomPublicId, listTop, type SearchByTagsOpts } from './post-search';

// =========================================================================================================
// Export — canonical cursor helpers (single source in helpers/cursor.ts) + split modules for compat
// =========================================================================================================

export const encodeCursor = encodeCursorHelper;
export const decodeCursor = decodeCursorHelper;
export type { CreatePostData, InsertPostStatementData, InsertMediaAssetStatementData, SearchByTagsOpts, PostCountFilter } from './post-types';
export { buildInsertPostStatement, buildInsertMediaAssetStatement } from './post-types';
export { searchByTags, count, findRandomPublicId, listTop } from './post-search';

// =========================================================================================================
// Queries
// =========================================================================================================

export class PostRepository {
	constructor(private readonly db: DB) {}

	async searchByTags(tagIds: number[], opts: SearchByTagsOpts): Promise<PostListingRow[]> {
		return searchByTags(this.db, tagIds, opts);
	}

	async findRandomPublicId(): Promise<string | null> {
		return findRandomPublicId(this.db);
	}

	listTop(limit = 100, since = 0, sort: 'score' | 'favorites' | 'recent' = 'score'): Promise<PostListingRow[]> {
		return listTop(this.db, limit, since, sort);
	}

	async findByPublicId(publicId: string): Promise<PostDetailRow | null> {
		return queryOne<PostDetailRow>(this.db, 'SELECT pl.*, p.author_id, p.title, p.description, p.canonical_post_id FROM post_listing pl JOIN posts p ON p.id = pl.post_id WHERE pl.public_id = ?', [publicId]);
	}

	async findPostById(id: number): Promise<PostRow | null> {
		return queryOne<PostRow>(this.db, 'SELECT * FROM posts WHERE id = ?', [id]);
	}

	async findPublicIdById(id: number): Promise<string | null> {
		const row = await queryOne<Pick<PostRow, 'public_id'>>(this.db, 'SELECT public_id FROM posts WHERE id = ?', [id]);
		return row?.public_id ?? null;
	}

	async findPostIdByPublicId(publicId: string): Promise<number | null> {
		const row = await queryOne<Pick<PostRow, 'id'>>(this.db, 'SELECT id FROM posts WHERE public_id = ?', [publicId]);
		return row?.id ?? null;
	}

	async updateUserActivityOnUpload(userId: number, now = Date.now()): Promise<void> {
		await execute(this.db, 'UPDATE user_activity SET last_upload_at = ?, updated_at = ? WHERE user_id = ?', [now, now, userId]);
	}

	async getLastUploadAt(userId: number): Promise<number | null> {
		const row = await queryOne<Pick<UserActivityRow, 'last_upload_at'>>(this.db, 'SELECT last_upload_at FROM user_activity WHERE user_id = ?', [userId]);
		return row?.last_upload_at ?? null;
	}

	async recalcScoreForPosts(postIds: number[]): Promise<void> {
		for (const postId of postIds) {
			const vals = await queryAll<Pick<PostRatingRow, 'value'>>(this.db, 'SELECT value FROM post_ratings WHERE post_id = ?', [postId]);
			const score = vals.reduce((s, x) => s + x.value, 0);

			await batch(this.db, [this.db.prepare('UPDATE posts SET score = ? WHERE id = ?').bind(score, postId), this.db.prepare('UPDATE post_listing SET score = ? WHERE post_id = ?').bind(score, postId)]);
		}
	}

	async findRecentlyRatedPostIds(limit = 100): Promise<number[]> {
		const rows = await queryAll<Pick<PostTagRow, 'post_id'>>(this.db, 'SELECT DISTINCT post_id FROM post_ratings WHERE updated_at > ? LIMIT ?', [Date.now() - 3600_000, limit]);

		return rows.map((r) => r.post_id);
	}

	async upsertRating(postId: number, userId: number, value: number): Promise<void> {
		const now = Date.now();

		await batch(this.db, [
			this.db
				.prepare('INSERT INTO post_ratings (post_id, user_id, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(post_id, user_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
				.bind(postId, userId, value, now, now),
			this.db.prepare('INSERT INTO jobs (job_type, entity_id, status, available_at, created_at) VALUES (?, ?, ?, ?, ?)').bind('recalculate_post_score', postId, 'pending', now + 60_000, now),
		]);
	}

	async addFavorite(postId: number, userId: number): Promise<void> {
		const now = Date.now();

		await batch(this.db, [
			this.db.prepare('INSERT OR IGNORE INTO post_favorites (post_id, user_id, created_at) VALUES (?, ?, ?)').bind(postId, userId, now),
			this.db.prepare('UPDATE posts SET favorite_count = (SELECT COUNT(*) FROM post_favorites WHERE post_id = ?), updated_at = ? WHERE id = ?').bind(postId, now, postId),
			this.db.prepare('UPDATE post_listing SET favorite_count = (SELECT COUNT(*) FROM post_favorites WHERE post_id = ?) WHERE post_id = ?').bind(postId, postId),
		]);
	}

	async removeFavorite(postId: number, userId: number): Promise<void> {
		const now = Date.now();

		await batch(this.db, [
			this.db.prepare('DELETE FROM post_favorites WHERE post_id = ? AND user_id = ?').bind(postId, userId),
			this.db.prepare('UPDATE posts SET favorite_count = (SELECT COUNT(*) FROM post_favorites WHERE post_id = ?), updated_at = ? WHERE id = ?').bind(postId, now, postId),
			this.db.prepare('UPDATE post_listing SET favorite_count = (SELECT COUNT(*) FROM post_favorites WHERE post_id = ?) WHERE post_id = ?').bind(postId, postId),
		]);
	}

	async listFavoritesByUser(userId: number, limit = 50, cursor?: { favoritedAt: number; postId: number }): Promise<{ data: FavoriteListingRow[]; nextCursor: { favoritedAt: number; postId: number } | null }> {
		const where = cursor ? ' AND (pf.created_at < ? OR (pf.created_at = ? AND pf.post_id < ?))' : '';
		const params = cursor ? [userId, cursor.favoritedAt, cursor.favoritedAt, cursor.postId, limit + 1] : [userId, limit + 1];
		const rows = await queryAll<FavoriteListingRow>(
			this.db,
			`SELECT pl.*, pf.created_at AS favorited_at FROM post_listing pl JOIN post_favorites pf ON pf.post_id = pl.post_id WHERE pf.user_id = ?${where} ORDER BY pf.created_at DESC, pf.post_id DESC LIMIT ?`,
			params,
		);
		const hasMore = rows.length > limit;
		const data = rows.slice(0, limit);
		const last = data[data.length - 1];
		return { data, nextCursor: hasMore && last ? { favoritedAt: last.favorited_at, postId: last.post_id } : null };
	}

	// =========================================================================================================
	// Commands
	// =========================================================================================================

	assertPostId(id: number): asserts id is import('../types').PostId {
		if (!Number.isInteger(id) || id < 1) throw new Error(`Invalid PostId: ${id}`);
	}
	isPostId(id: number): id is import('../types').PostId {
		return Number.isInteger(id) && id >= 1;
	}

	async createPost(data: CreatePostData): Promise<PostRow['id']> {
		const normalized = data.tags.map(normalizeTag).filter(Boolean);
		const now = Date.now();

		const postId = (await queryOne<NextIdRow>(this.db, 'SELECT COALESCE(MAX(id),0)+1 as v FROM posts', []))?.v ?? 1;
		const mediaAssetId = (await queryOne<NextIdRow>(this.db, 'SELECT COALESCE(MAX(id),0)+1 as v FROM media_assets', []))?.v ?? 1;

		const dup = await queryOne<Pick<MediaAssetRow, 'post_id'>>(this.db, 'SELECT post_id FROM media_assets WHERE checksum = ?', [data.checksum]);
		const isDuplicate = !!dup;
		const status = isDuplicate ? 'duplicate' : 'processing';
		const canonical = dup?.post_id ?? null;

		const tagIds = await new tagRepo.TagRepository(this.db).ensureTags(normalized, data.authorId);

		const stmts: D1PreparedStatement[] = [
			buildInsertPostStatement(this.db, {
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
			buildInsertMediaAssetStatement(this.db, {
				id: mediaAssetId,
				postId,
				mediaType: data.mediaType,
				originalKey: data.originalKey,
				mimeType: data.mimeType,
				byteSize: data.byteSize,
				checksum: data.checksum,
				processingStatus: isDuplicate ? 'done' : 'pending',
				createdAt: now,
			}),
		];

		for (const tid of tagIds) {
			stmts.push(this.db.prepare('INSERT INTO post_tags (post_id, tag_id, added_by, created_at) VALUES (?, ?, ?, ?)').bind(postId, tid, data.authorId, now));
		}

		if (!isDuplicate) {
			stmts.push(this.db.prepare('INSERT INTO jobs (job_type, entity_id, status, available_at, created_at) VALUES (?, ?, ?, ?, ?)').bind('process_media', postId, 'pending', now, now));
		}

		await batch(this.db, stmts);

		return postId;
	}

	async createStreamPost(data: { publicId: string; authorId: number; title: string | null; tags: string[]; streamUid: string }): Promise<PostRow['id']> {
		const existing = await queryOne<Pick<PostRow, 'id'>>(this.db, 'SELECT id FROM posts WHERE stream_uid = ?', [data.streamUid]);
		if (existing) return existing.id;

		const now = Date.now();
		const postId = (await queryOne<NextIdRow>(this.db, 'SELECT COALESCE(MAX(id),0)+1 AS v FROM posts', []))?.v ?? 1;
		const assetId = (await queryOne<NextIdRow>(this.db, 'SELECT COALESCE(MAX(id),0)+1 AS v FROM media_assets', []))?.v ?? 1;
		const tagIds = await new tagRepo.TagRepository(this.db).ensureTags(data.tags.map(normalizeTag).filter(Boolean), data.authorId);
		const checksum = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(data.streamUid));
		const key = `stream/${data.streamUid}`;
		const statements: D1PreparedStatement[] = [
			this.db
				.prepare("INSERT INTO posts (id, public_id, author_id, media_type, status, title, stream_uid, created_at, published_at, updated_at) VALUES (?, ?, ?, 'video', 'available', ?, ?, ?, ?, ?)")
				.bind(postId, data.publicId, data.authorId, data.title, data.streamUid, now, now, now),
			this.db
				.prepare("INSERT INTO media_assets (id, post_id, media_type, provider, original_object_key, mime_type, byte_size, checksum, processing_status, created_at) VALUES (?, ?, 'video', 'stream', ?, 'video/mp4', 0, ?, 'done', ?)")
				.bind(assetId, postId, key, checksum, now),
			this.db
				.prepare(
					"INSERT INTO post_listing (post_id, public_id, media_type, status, low_variant_key, medium_variant_key, score, rating_count, favorite_count, comment_count, published_at) VALUES (?, ?, 'video', 'available', ?, ?, 0, 0, 0, 0, ?)",
				)
				.bind(postId, data.publicId, key, key, now),
		];
		for (const tagId of tagIds) statements.push(this.db.prepare('INSERT INTO post_tags (post_id, tag_id, added_by, created_at) VALUES (?, ?, ?, ?)').bind(postId, tagId, data.authorId, now));
		await batch(this.db, statements);
		return postId;
	}

	findStreamPost(streamUid: string): Promise<Pick<PostRow, 'id' | 'public_id'> | null> {
		return queryOne<Pick<PostRow, 'id' | 'public_id'>>(this.db, 'SELECT id, public_id FROM posts WHERE stream_uid = ?', [streamUid]);
	}
}
