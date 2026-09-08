// =========================================================================================================
// VALIDATORS (v2)
// =========================================================================================================
// Zod is the only input validation. Every route safeParse before service.
// =========================================================================================================

import { z } from 'zod';
import { ValidationError } from './domain/errors';

// =========================================================================================================
// Consts
// =========================================================================================================

const MAX_SANITIZE_LENGTH = 100_000;

export const USER_RANKS = ['new', 'normal', 'trusted', 'restricted', 'banned'] as const satisfies readonly string[];
export const POST_STATUSES = ['uploading', 'processing', 'available', 'duplicate', 'rejected', 'hidden'] as const satisfies readonly string[];
export const MEDIA_TYPES = ['image', 'gif', 'video'] as const satisfies readonly string[];
export const TAG_CATEGORIES = ['reaction', 'source', 'people', 'character', 'meta'] as const satisfies readonly string[];

// =========================================================================================================
// Helpers
// =========================================================================================================

export function sanitizeHtml(str: string): string {
	if (str.length > MAX_SANITIZE_LENGTH) throw new ValidationError('Input too large');
	return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function sanitizedString(max: number) {
	return z.string().max(max).transform(sanitizeHtml);
}

export function normalizeTag(input: string): string {
	return input
		.toLowerCase()
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/ñ/g, 'n')
		.replace(/ü/g, 'u')
		.replace(/[^a-z0-9]+/g, '_')
		.replace(/^_+|_+$/g, '')
		.replace(/__+/g, '_');
}

function parseQueryWithArrays(url: string): Record<string, string | string[]> {
	const sp = new URL(url).searchParams;
	const out: Record<string, string | string[]> = {};
	for (const k of new Set(sp.keys())) {
		const all = sp.getAll(k);
		out[k] = all.length === 1 ? all[0]! : all;
	}
	return out;
}

export { parseQueryWithArrays };

// =========================================================================================================
// Schemas
// =========================================================================================================

export const usernameSchema = z
	.string()
	.min(3)
	.max(20)
	.regex(/^[a-z0-9_]+$/, 'solo minusculas, numeros y _');

export const tagNormalizedSchema = z
	.string()
	.min(1)
	.max(40)
	.regex(/^[a-z0-9_]+$/, 'tag debe ser minusculas, sin ñ/acentos, espacios como _');

export const CreatePostSchema = z.object({
	title: sanitizedString(120).optional().nullable(),
	description: sanitizedString(2000).optional().nullable(),
	tags: z.array(z.string()).min(1).max(20),
	media_type: z.enum(MEDIA_TYPES),
});

export const CommentSchema = z.object({
	body: sanitizedString(2000).refine((v) => v.trim().length > 0, 'body requerido'),
	parent_id: z.number().int().nullable().optional(),
});

export const RatingSchema = z.object({
	value: z
		.number()
		.int()
		.min(-5)
		.max(5)
		.refine((v) => v !== 0, '0 no permitido'),
});

export const ReportSchema = z.object({
	target_type: z.enum(['post', 'comment', 'user', 'tag']),
	target_id: z.number().int().min(1),
	reason: sanitizedString(500).refine((v) => v.trim().length > 0, 'reason requerido'),
});

export const ModerationActionSchema = z.object({
	target_type: z.enum(['post', 'user', 'comment', 'tag']),
	target_id: z.number().int().min(1),
	action: z.enum(['hide', 'reject', 'ban', 'restrict', 'approve']),
	reason: sanitizedString(500).optional().nullable(),
});

export const TotpVerifySchema = z.object({ code: z.string().length(6) });

export const SearchQuerySchema = z.object({
	tags: z.string().max(500).optional().catch(undefined),
	q: z.string().trim().min(1).max(100).optional().catch(undefined),
	sort: z.enum(['recent', 'popular']).catch('recent').default('recent'),
	cursor: z.string().max(200).optional().catch(undefined),
	limit: z.coerce.number().int().min(1).max(60).catch(20).default(20),
	page: z.coerce.number().int().min(1).catch(1).default(1),
	sort_by: z.enum(['created_at', 'title', 'published_at', 'score']).catch('created_at').default('created_at'),
	sort_order: z.enum(['asc', 'desc']).catch('desc').default('desc'),
});

export const PostFilterSchema = z.object({
	status: z
		.union([z.enum(POST_STATUSES), z.array(z.enum(POST_STATUSES))])
		.optional()
		.catch(undefined),
	media_type: z
		.union([z.enum(MEDIA_TYPES), z.array(z.enum(MEDIA_TYPES))])
		.optional()
		.catch(undefined),
	q: z.string().trim().min(1).max(100).optional().catch(undefined),
	page: z.coerce.number().int().min(1).catch(1).default(1),
	limit: z.coerce.number().int().min(1).max(60).catch(24).default(24),
	sort_by: z.enum(['created_at', 'score', 'published_at']).catch('published_at').default('published_at'),
	sort_order: z.enum(['asc', 'desc']).catch('desc').default('desc'),
});

export const PaginationSchema = z.object({
	page: z.coerce.number().int().min(1).catch(1).default(1),
	limit: z.coerce.number().int().min(1).max(60).catch(24).default(24),
});

// =========================================================================================================
// Response schemas — shared frontend/backend, frontend safeParse sin as
// =========================================================================================================

export const HealthResponseSchema = z.object({ status: z.string(), version: z.string(), db: z.string() });
export const UserResponseSchema = z.object({ user: z.object({ id: z.number(), username: z.string(), rank: z.string(), display_name: z.string().nullable().optional(), status: z.string().optional() }).nullable() });
export const AutocompleteResponseSchema = z.object({ tags: z.array(z.object({ name: z.string(), display: z.string().nullable().optional(), usage: z.number().optional() })) });
export const TagItemSchema = z.object({ name: z.string(), display: z.string().nullable().optional(), usage: z.number() });
export const BrowseTagsQuerySchema = z.object({
	category: z.enum(TAG_CATEGORIES).optional().catch(undefined),
	limit: z.coerce.number().int().min(1).max(100).catch(50).default(50),
	offset: z.coerce.number().int().min(0).catch(0).default(0),
});
export const BrowseTagsResponseSchema = z.object({
	groups: z.record(z.enum(TAG_CATEGORIES), z.object({ tags: z.array(TagItemSchema) })),
});
export const GridItemSchema = z.object({ public_id: z.string(), low_variant_key: z.string().nullable().optional(), score: z.number(), favorite_count: z.number(), tags: z.array(z.string()).optional() });
export const SearchResponseSchema = z.object({ data: z.array(GridItemSchema), nextCursor: z.string().nullable(), hasMore: z.boolean().optional(), warning: z.string().optional() });
export const PostTagSchema = z.object({ name: z.string(), category: z.string(), count: z.number() });
export const PostResponseSchema = z.object({
	public_id: z.string().optional(),
	publicId: z.string().optional(),
	title: z.string().nullable().optional(),
	description: z.string().nullable().optional(),
	score: z.number().optional(),
	favorite_count: z.number().optional(),
	comment_count: z.number().optional(),
	tags: z.array(PostTagSchema).optional(),
	author_username: z.string().nullable().optional(),
	media_type: z.string().optional(),
	rating_count: z.number().optional(),
	published_at: z.number().optional(),
	post_id: z.number().optional(),
	restricted: z.boolean().optional(),
	redirectTo: z.string().optional(),
});
export const CreatePostResponseSchema = z.object({ publicId: z.string(), postId: z.number(), status: z.string().optional() });
export const FavoritesResponseSchema = z.object({ data: z.array(GridItemSchema) });
export const TotpSetupResponseSchema = z.object({ secret: z.string(), uri: z.string() });
export const TotpVerifyResponseSchema = z.object({ ok: z.boolean(), recoveryCodes: z.array(z.string()).optional() });
export const CommentItemSchema = z.object({ id: z.number(), body: z.string(), author_id: z.number(), author_username: z.string().nullable().optional(), created_at: z.number().optional() });
export const CommentListResponseSchema = z.object({ data: z.array(CommentItemSchema) });

// =========================================================================================================
// Inferred input types — single source for service signatures (never inline anonymous)
// =========================================================================================================

export type ReportInput = z.infer<typeof ReportSchema>;
export type ModerationActionInput = z.infer<typeof ModerationActionSchema>;
export type CreatePostInput = z.infer<typeof CreatePostSchema>;
export type CommentInput = z.infer<typeof CommentSchema>;
export type RatingInput = z.infer<typeof RatingSchema>;
export type SearchQueryInput = z.infer<typeof SearchQuerySchema>;
export type PostFilterInput = z.infer<typeof PostFilterSchema>;
export type PaginationInput = z.infer<typeof PaginationSchema>;
export type TotpVerifyInput = z.infer<typeof TotpVerifySchema>;
export type BrowseTagsQueryInput = z.infer<typeof BrowseTagsQuerySchema>;
export type BrowseTagsResponse = z.infer<typeof BrowseTagsResponseSchema>;
