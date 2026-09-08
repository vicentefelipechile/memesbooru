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
import * as userRepo from '../repositories/user-repository';
import { NotFoundError, ForbiddenError, ValidationError } from '../domain/errors';
import type { AuthUser, CreatedPostResult, PostSearchResult, PostDetailResult, SearchResult } from '../types';
import { toPostId, toPublicId, toUserId } from '../types';
import type { PostCursor } from '../helpers/cursor';
import type { CreatePostInput, SearchQueryInput } from '../validators';
import type { PostRow } from '../db/schema';

// Service input derived via Pick/Omit — never inline anonymous
export type CreatePostServiceInput = Pick<CreatePostInput, 'tags'> & {
	title: CreatePostInput['title'];
	mediaType: CreatePostInput['media_type'];
};
export type SearchParams = Pick<SearchQueryInput, 'tags' | 'cursor' | 'limit'> & { sort: SearchQueryInput['sort'] };

// =========================================================================================================
// Service
// =========================================================================================================

export class PostService {
	constructor(private readonly db: DB) {}

	async search(params: SearchParams): Promise<SearchResult> {
		const tagNames = params.tags ? params.tags.split(/\s+/).filter(Boolean) : [];
		const tagIds = tagNames.length ? await tagRepo.resolveTagIds(this.db, tagNames) : [];

		if (tagNames.length > 0 && tagIds.length === 0) return { data: [], nextCursor: null, hasMore: false };

		const sortedTagIds = await tagRepo.sortTagIdsByUsage(this.db, tagIds);
		const rows = await postRepo.searchByTags(this.db, sortedTagIds, { sort: params.sort, cursor: params.cursor, limit: params.limit });

		const nextCursor = rows.length === params.limit ? this.buildNextCursor(params.sort, rows) : null;

		return { data: rows, nextCursor, hasMore: !!nextCursor };
	}

	private buildNextCursor(sort: SearchParams['sort'], rows: PostSearchResult[]): string {
		const last = rows[rows.length - 1];

		if (sort === 'popular') return postRepo.encodeCursor({ score: last.score, id: last.post_id } satisfies PostCursor);

		return postRepo.encodeCursor({ published_at: last.published_at, id: last.post_id } satisfies PostCursor);
	}

	async random(): Promise<string | null> {
		return postRepo.findRandomPublicId(this.db);
	}

	async detail(publicId: string, viewer: AuthUser | null): Promise<PostDetailResult> {
		const row = await postRepo.findByPublicId(this.db, publicId);

		if (!row) throw new NotFoundError('Post not found');

		if (row.canonical_post_id) {
			const canonPublicId = await postRepo.findPublicIdById(this.db, row.canonical_post_id);

			if (canonPublicId) throw new ValidationError('Duplicate', { redirectTo: canonPublicId });
		}

		const canSeeVideo = viewer?.rank === 'trusted';

		if (row.media_type === 'video' && !canSeeVideo) {
			return {
				...row,
				author_id: toUserId(row.author_id),
				author_username: null,
				canonical_post_id: row.canonical_post_id ? toPostId(row.canonical_post_id) : null,
				lowVariantKey: null,
				mediumVariantKey: null,
				restricted: true,
				tags: [] as PostDetailResult['tags'],
			} satisfies PostDetailResult;
		}

		const tags = await tagRepo.findByPostId(this.db, row.post_id);
		const author = await userRepo.findById(this.db, row.author_id);

		return {
			...row,
			author_id: toUserId(row.author_id),
			author_username: author?.username ?? null,
			canonical_post_id: row.canonical_post_id ? toPostId(row.canonical_post_id) : null,
			tags: tags.map((t) => ({ name: t.normalized_name, category: t.category, count: t.usage_count })),
		} satisfies PostDetailResult;
	}

	async create(viewer: AuthUser, input: CreatePostServiceInput, queue?: Queue): Promise<CreatedPostResult> {
		if (viewer.status !== 'active') throw new ForbiddenError('cuenta restringida');

		if (input.mediaType === 'video' && viewer.rank !== 'trusted') throw new ForbiddenError('videos solo para trusted');

		// ranking cooldown check
		if (viewer.rank === 'new') {
			const last = (await postRepo.getLastUploadAt(this.db, viewer.id)) ?? 0;

			if (Date.now() - last < 3600 * 1000) {
				throw new ValidationError('cooldown 1h para cuentas nuevas', { retryAfter: 3600 * 1000 - (Date.now() - last) });
			}
		}

		const publicId = toPublicId(crypto.randomUUID().slice(0, 8));
		const checksum = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(publicId + Date.now()));
		const originalKey = `media/${publicId}/original` as const satisfies `media/${string}/original`;

		const postId = toPostId(
			await postRepo.createPost(this.db, {
				publicId,
				authorId: viewer.id,
				mediaType: input.mediaType,
				tags: input.tags,
				title: input.title ?? null,
				checksum,
				originalKey,
			}),
		);

		await postRepo.updateUserActivityOnUpload(this.db, viewer.id);

		if (queue) await queue.send({ type: 'process_media', postId });

		return { publicId, postId };
	}
}
