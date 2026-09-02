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
import type { PostCursor } from '../helpers/cursor';

// =========================================================================================================
// Service
// =========================================================================================================

export class PostService {
	constructor(private readonly db: DB) {}

	async search(params: { tags?: string; sort: 'recent' | 'popular'; cursor?: string; limit: number }): Promise<{ data: unknown[]; nextCursor: string | null; hasMore: boolean }> {
		const tagNames = params.tags ? params.tags.split(/\s+/).filter(Boolean) : [];
		const tagIds = tagNames.length ? await tagRepo.resolveTagIds(this.db, tagNames) : [];
		if (tagNames.length > 0 && tagIds.length === 0) return { data: [], nextCursor: null, hasMore: false };
		const sortedTagIds = await tagRepo.sortTagIdsByUsage(this.db, tagIds);
		const rows = await postRepo.searchByTags(this.db, sortedTagIds, { sort: params.sort, cursor: params.cursor, limit: params.limit });
		const nextCursor =
			rows.length === params.limit
				? params.sort === 'popular'
					? postRepo.encodeCursor({ score: rows[rows.length - 1].score, id: rows[rows.length - 1].post_id } satisfies PostCursor)
					: postRepo.encodeCursor({ published_at: rows[rows.length - 1].published_at, id: rows[rows.length - 1].post_id } satisfies PostCursor)
				: null;
		return { data: rows, nextCursor, hasMore: !!nextCursor };
	}

	async detail(publicId: string, viewer: AuthUser | null): Promise<unknown> {
		const row = await postRepo.findByPublicId(this.db, publicId);
		if (!row) throw new NotFoundError('Post not found');
		if (row.canonical_post_id) {
			const canonPublicId = await postRepo.findPublicIdById(this.db, row.canonical_post_id);
			if (canonPublicId) throw new ValidationError('Duplicate', { redirectTo: canonPublicId });
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
			const last = (await postRepo.getLastUploadAt(this.db, viewer.id)) ?? 0;
			if (Date.now() - last < 3600 * 1000) throw new ValidationError('cooldown 1h para cuentas nuevas', { retryAfter: 3600 * 1000 - (Date.now() - last) });
		}
		const publicId = crypto.randomUUID().slice(0, 8);
		const checksum = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(publicId + Date.now()));
		const originalKey = `media/${publicId}/original`;
		const postId = await postRepo.createPost(this.db, { publicId, authorId: viewer.id, mediaType: input.mediaType, tags: input.tags, title: input.title ?? null, checksum, originalKey });
		await postRepo.updateUserActivityOnUpload(this.db, viewer.id);
		if (queue) await queue.send({ type: 'process_media', postId });
		return { publicId, postId };
	}
}
