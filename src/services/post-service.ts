// =========================================================================================================
// POST SERVICE (v2)
// =========================================================================================================
// Business rules for posts, search, media gating. No Hono. Throw DomainError.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import type { DB } from '../db/client';
import { PostRepository } from '../repositories/post-repository';
import { TagRepository } from '../repositories/tag-repository';
import { UserRepository } from '../repositories/user-repository';
import { NotFoundError, ForbiddenError, ValidationError } from '../domain/errors';
import type { AuthUser, CreatedPostResult, PostSearchResult, PostDetailResult, SearchResult, JsonValue } from '../types';
import { toPostId, toPublicId, toUserId } from '../types';
import { decodeCursor, encodeCursor as encodeCursorHelper, type PostCursor } from '../helpers/cursor';
import { normalizeTag, SearchCursorSchema } from '../validators';
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
	private readonly posts: PostRepository;
	private readonly tags: TagRepository;
	private readonly users: UserRepository;

	constructor(private readonly db: DB) {
		this.posts = new PostRepository(db);
		this.tags = new TagRepository(db);
		this.users = new UserRepository(db);
	}

	async search(params: SearchParams): Promise<SearchResult> {
		this.validateSearchCursor(params);
		const terms = params.tags?.split(/\s+/).filter(Boolean) ?? [];
		const included = [...new Set(terms.filter((tag) => !tag.startsWith('-')).map(normalizeTag))];
		const excluded = terms.filter((tag) => tag.startsWith('-'));
		const resolved = await this.tags.resolveTags(included);

		if (included.some((tag) => !resolved.known.has(tag))) return { data: [], tags: [], nextCursor: null, hasMore: false };

		const excludedNames = excluded.map((tag) => normalizeTag(tag.slice(1)));
		const excludedTagIds = await this.tags.resolveTagIds(excludedNames);
		const sortedTagIds = await this.tags.sortTagIdsByUsage(resolved.ids);
		const found = await this.posts.searchByTags(sortedTagIds, { sort: params.sort, cursor: params.cursor, limit: params.limit + 1, excludedTagIds });
		const hasMore = found.length > params.limit;
		const rows = found.slice(0, params.limit);
		const postIds = rows.map((row) => toPostId(row.post_id));
		const pageTags = await this.tags.findByPostIds(postIds);

		return {
			data: rows,
			tags: pageTags.map((tag) => ({ name: tag.normalized_name, category: tag.category, count: tag.usage_count })),
			nextCursor: hasMore ? this.buildNextCursor(params.sort, rows) : null,
			hasMore,
		};
	}

	private validateSearchCursor(params: SearchParams): void {
		if (!params.cursor) return;

		const parsed = SearchCursorSchema.safeParse(decodeCursor<JsonValue>(params.cursor));

		if (!parsed.success || (params.sort === 'popular' ? parsed.data.score === undefined : parsed.data.published_at === undefined)) {
			throw new ValidationError('Invalid search cursor');
		}
	}

	private buildNextCursor(sort: SearchParams['sort'], rows: PostSearchResult[]): string {
		const last = rows[rows.length - 1];

		if (sort === 'popular') return encodeCursorHelper({ score: last.score, id: last.post_id } satisfies PostCursor);

		return encodeCursorHelper({ published_at: last.published_at, id: last.post_id } satisfies PostCursor);
	}

	async random(): Promise<string | null> {
		return this.posts.findRandomPublicId();
	}

	async detail(publicId: string, viewer: AuthUser | null): Promise<PostDetailResult> {
		const row = await this.posts.findByPublicId(publicId);

		if (!row) throw new NotFoundError('Post not found');

		if (row.canonical_post_id) {
			const canonPublicId = await this.posts.findPublicIdById(row.canonical_post_id);

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

		const tags = await this.tags.findByPostId(row.post_id);
		const author = await this.users.findById(row.author_id);

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
			const last = (await this.posts.getLastUploadAt(viewer.id)) ?? 0;

			if (Date.now() - last < 3600 * 1000) {
				throw new ValidationError('cooldown 1h para cuentas nuevas', { retryAfter: 3600 * 1000 - (Date.now() - last) });
			}
		}

		const publicId = toPublicId(crypto.randomUUID().slice(0, 8));
		const checksum = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(publicId + Date.now()));
		const originalKey = `media/${publicId}/original` as const satisfies `media/${string}/original`;

		const postId = toPostId(
			await this.posts.createPost({
				publicId,
				authorId: viewer.id,
				mediaType: input.mediaType,
				tags: input.tags,
				title: input.title ?? null,
				checksum,
				originalKey,
			}),
		);

		await this.posts.updateUserActivityOnUpload(viewer.id);

		if (queue) await queue.send({ type: 'process_media', postId });

		return { publicId, postId };
	}
}
