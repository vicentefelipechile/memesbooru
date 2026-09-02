// =========================================================================================================
// VALIDATORS (v2)
// =========================================================================================================
// Zod is the only input validation. Every route safeParse before service.
// =========================================================================================================

import { z } from 'zod';

// =========================================================================================================
// Helpers
// =========================================================================================================

const MAX_SANITIZE_LENGTH = 100_000;

export function sanitizeHtml(str: string): string {
	if (str.length > MAX_SANITIZE_LENGTH) throw new Error('Input too large');
	return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
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
// Enums
// =========================================================================================================

export const USER_RANKS = ['new', 'normal', 'trusted', 'restricted', 'banned'] as const;
export const POST_STATUSES = ['uploading', 'processing', 'available', 'duplicate', 'rejected', 'hidden'] as const;
export const MEDIA_TYPES = ['image', 'gif', 'video'] as const;
export const TAG_CATEGORIES = ['general', 'artist', 'character', 'series', 'meta', 'copyright'] as const;

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
	title: z
		.string()
		.max(120)
		.optional()
		.nullable()
		.transform((v) => (v ? sanitizeHtml(v) : v)),
	description: z
		.string()
		.max(2000)
		.optional()
		.nullable()
		.transform((v) => (v ? sanitizeHtml(v) : v)),
	tags: z.array(z.string()).min(1).max(20),
	media_type: z.enum(MEDIA_TYPES),
});

export const CommentSchema = z.object({
	body: z
		.string()
		.min(1)
		.max(2000)
		.transform((v) => sanitizeHtml(v)),
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
	reason: z
		.string()
		.min(1)
		.max(500)
		.transform((v) => sanitizeHtml(v)),
});

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
