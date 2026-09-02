// =========================================================================================================
// POST SERVICE (v2)
// =========================================================================================================
// Business rules for posts, search, media gating. No Hono. Throw DomainError.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import type { DB } from '../db/client';
import * as postRepo from '../repositories/post-repository';
import * as tagRepo from '../repositories/tag-repository';
import { NotFoundError, ForbiddenError, ValidationError } from '../domain/errors';
import type { AuthUser } from '../types';

// =========================================================================================================
// Service
// =========================================================================================================

export class PostService {
	constructor(private readonly db: DB) {}

	async search(params: { tags?: string; sort: 'recent' | 'popular'; cursor?: string; limit: number }): Promise<{ data: unknown[]; nextCursor: string | null; hasMore: boolean }> {
		const tagNames = params.tags ? params.tags.split(/\s+/).filter(Boolean) : [];
		const tagIds = tagNames.length ? await tagRepo.resolveTagIds(this.db, tagNames) : [];
		if (tagNames.length > 0 && tagIds.length === 0) return { data: [], nextCursor: null, hasMore: false };
		let sortedTagIds = tagIds;
		if (tagIds.length > 1) {
			const rows = await this.db
				.prepare(`SELECT id, usage_count FROM tags WHERE id IN (${tagIds.map(() => '?').join(',')})`)
				.bind(...tagIds)
				.all<{ id: number; usage_count: number }>();
			sortedTagIds = (rows.results ?? []).sort((a, b) => a.usage_count - b.usage_count).map((r) => r.id);
		}
		const rows = await postRepo.searchByTags(this.db, sortedTagIds, { sort: params.sort, cursor: params.cursor, limit: params.limit });
		const nextCursor =
			rows.length === params.limit
				? params.sort === 'popular'
					? postRepo.encodeCursor({ score: rows[rows.length - 1].score, id: rows[rows.length - 1].post_id })
					: postRepo.encodeCursor({ published_at: rows[rows.length - 1].published_at, id: rows[rows.length - 1].post_id })
				: null;
		return { data: rows, nextCursor, hasMore: !!nextCursor };
	}

	async detail(publicId: string, viewer: AuthUser | null): Promise<unknown> {
		const row = await postRepo.findByPublicId(this.db, publicId);
		if (!row) throw new NotFoundError('Post not found');
		if (row.canonical_post_id) {
			const canon = await this.db.prepare('SELECT public_id FROM posts WHERE id = ?').bind(row.canonical_post_id).first<{ public_id: string }>();
			if (canon) throw new ValidationError('Duplicate', { redirectTo: canon.public_id });
		}
		const canSeeVideo = viewer?.rank === 'trusted';
		if (row.media_type === 'video' && !canSeeVideo) {
			return { ...row, lowVariantKey: null, mediumVariantKey: null, restricted: true, tags: [] };
		}
		const tags = await tagRepo.findByPostId(this.db, row.post_id);
		return { ...row, tags: tags.map((t) => t.normalized_name) };
	}

	async create(viewer: AuthUser, input: { title?: string | null; tags: string[]; mediaType: 'image' | 'gif' | 'video' }, queue?: Queue): Promise<{ publicId: string; postId: number }> {
		if (viewer.status !== 'active') throw new ForbiddenError('cuenta restringida');
		if (input.mediaType === 'video' && viewer.rank !== 'trusted') throw new ForbiddenError('videos solo para trusted');
		// ranking cooldown check
		if (viewer.rank === 'new') {
			const row = await this.db.prepare('SELECT last_upload_at FROM user_activity WHERE user_id = ?').bind(viewer.id).first<{ last_upload_at: number | null }>();
			const last = row?.last_upload_at ?? 0;
			if (Date.now() - last < 3600 * 1000) throw new ValidationError('cooldown 1h para cuentas nuevas', { retryAfter: 3600 * 1000 - (Date.now() - last) });
		}
		const publicId = crypto.randomUUID().slice(0, 8);
		const checksum = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(publicId + Date.now()));
		const originalKey = `media/${publicId}/original`;
		const postId = await postRepo.createPost(this.db, { publicId, authorId: viewer.id, mediaType: input.mediaType, tags: input.tags, title: input.title ?? null, checksum, originalKey });
		await this.db.prepare('UPDATE user_activity SET last_upload_at = ?, updated_at = ? WHERE user_id = ?').bind(Date.now(), Date.now(), viewer.id).run();
		if (queue) await queue.send({ type: 'process_media', postId });
		return { publicId, postId };
	}
}
