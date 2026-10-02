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

export const PERMISSIONS = [
	'manage_roles',
	'moderate',
	'edit_tags',
	'manage_artists',
	'manage_forum',
	'upload_video',
	'view_video',
	'upload_without_cooldown',
	'upload_post',
	'comment',
	'vote',
	'favorite',
	'report',
	'create_pool',
	'create_topic',
	'edit_wiki',
	'contact',
] as const satisfies readonly string[];
export const PermissionSchema = z.enum(PERMISSIONS);
export const CreateRoleSchema = z.object({
	name: z
		.string()
		.trim()
		.min(2)
		.max(40)
		.regex(/^[a-zA-Z0-9 _-]+$/),
	permissions: z.array(PermissionSchema).max(PERMISSIONS.length),
});
export const UpdateRoleSchema = CreateRoleSchema.partial();
export const RoleAssignmentSchema = z.object({ role_id: z.number().int().positive() });
export const RoleSchema = z.object({ id: z.number(), name: z.string(), position: z.number(), managed: z.number(), permissions: z.array(PermissionSchema) });
export const RolesResponseSchema = z.object({ data: z.array(RoleSchema) });
export const UserRolesResponseSchema = z.object({ data: z.array(RoleSchema.omit({ permissions: true })) });
export const POST_STATUSES = ['uploading', 'processing', 'available', 'duplicate', 'rejected', 'hidden'] as const satisfies readonly string[];
export const MEDIA_TYPES = ['image', 'gif', 'video'] as const satisfies readonly string[];
export const TAG_CATEGORIES = ['reaction', 'source', 'people', 'character', 'meta'] as const satisfies readonly string[];
export const TagDisplayNameSchema = z
	.string()
	.min(1)
	.max(100)
	.regex(/^[a-z0-9]+(?:_[a-z0-9]+)*(?:_\([a-z0-9]+(?:_[a-z0-9]+)*\))?$/, 'Usa minúsculas, números y guiones bajos; opcionalmente _(tipo).');

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

export const TagInputSchema = z
	.string()
	.trim()
	.min(1)
	.max(100)
	.refine((value) => {
		const normalized = normalizeTag(value);
		return normalized.length > 0 && normalized.length <= 40;
	}, 'Invalid tag name');

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
	tags: z.array(TagInputSchema).min(1).max(20),
	media_type: z.enum(MEDIA_TYPES),
});

export const CommentSchema = z.object({
	body: sanitizedString(2000).refine((v) => v.trim().length > 0, 'body requerido'),
	parent_id: z.number().int().positive().nullable().optional(),
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
export const TurnstileActionSchema = z.enum(['login', 'signup']);
export const TurnstileSiteverifySchema = z.object({ success: z.boolean(), action: TurnstileActionSchema.optional(), hostname: z.string().optional() });
const AccountUsernameSchema = z
	.string()
	.trim()
	.regex(/^[a-zA-Z0-9_]{3,24}$/);
export const PasswordLoginSchema = z.object({ username: AccountUsernameSchema, password: z.string().min(8).max(128), turnstile_token: z.string().min(1).max(2048) });
export const RegisterSchema = z.object({
	username: AccountUsernameSchema,
	password: z.string().min(8).max(128),
	turnstile_token: z.string().min(1).max(2048),
});
export const PasswordChangeSchema = z.object({ current_password: z.string().min(1).max(128), password: z.string().min(8).max(128) });
export const ProfileSchema = z.object({
	display_name: z.string().trim().min(1).max(100).nullable(),
	bio: z.string().trim().max(500).nullable(),
	avatar_url: z
		.url()
		.max(500)
		.refine((url) => new URL(url).protocol === 'https:', 'Use an HTTPS image URL')
		.nullable(),
});
export const ProfileUsernameSchema = z.string().regex(/^[a-zA-Z0-9_]{3,24}$/);
export const ProfileCursorSchema = z.object({ created_at: z.number().int().nonnegative(), id: z.number().int().positive() });
export const ProfilePostsQuerySchema = z.object({ cursor: z.string().max(200).optional(), limit: z.coerce.number().int().min(1).max(40).default(20) });

export const SearchCursorSchema = z.object({ id: z.number().int().positive(), score: z.number().optional(), published_at: z.number().optional() });

export const SearchQuerySchema = z
	.object({
		tags: z
			.union([z.string(), z.array(z.string())])
			.transform((value) => (Array.isArray(value) ? value.join(' ') : value))
			.pipe(z.string().max(500))
			.refine((value) => value.trim().split(/\s+/).filter(Boolean).length <= 40, 'Too many search tags')
			.refine(
				(value) =>
					value
						.split(/\s+/)
						.filter(Boolean)
						.every((tag) => normalizeTag(tag.replace(/^-/, '')).length > 0),
				'Invalid search tag',
			)
			.optional(),
		sort: z.enum(['recent', 'popular']).catch('recent').default('recent'),
		cursor: z.string().max(200).optional(),
		limit: z.coerce.number().int().min(1).max(60).catch(20).default(20),
	})
	.strict();

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
// Community input schemas
// =========================================================================================================

export const CommunityLimitSchema = z.coerce.number().int().min(1).max(100).catch(50);
export const CommunityIdSchema = z.coerce.number().int().positive();
export const CreateArtistSchema = z.object({ name: z.string().trim().min(1).max(100) });
export const ArtistStatusSchema = z.object({ status: z.enum(['active', 'deleted']) });
export const ArtistAliasSchema = z.object({ artist_id: z.number().int().positive(), alias: z.string().trim().min(1).max(100) });
export const PostArtistSchema = z.object({ post_id: z.number().int().positive(), artist_id: z.number().int().positive() });
export const CreatePoolSchema = z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(2000).nullable().optional() });
export const CreateTopicSchema = z.object({ category_id: z.number().int().positive(), title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(5000) });
export const CreateWikiSchema = z.object({ tag: z.string().trim().min(1).max(100), title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(10000) });
export const CreateReplySchema = z.object({ topic_id: z.number().int().positive(), body: z.string().trim().min(1).max(5000) });
export const PoolPostSchema = z.object({ pool_id: z.number().int().positive(), post_id: z.number().int().positive() });
export const WikiRevisionSchema = z.object({ body: z.string().trim().min(1).max(10000), reason: z.string().trim().max(200).nullable().optional() });
export const WikiRevertSchema = z.object({ revision_id: z.number().int().positive() });
export const CommunityContactSchema = z.object({ subject: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(10000) });
export const PoolOrderSchema = z.object({ pool_id: z.number().int().positive(), post_id: z.number().int().positive(), position: z.number().int().positive() });
export const TopicEditSchema = z.object({ topic_id: z.number().int().positive(), title: z.string().trim().min(1).max(200) });
export const TopicStatusSchema = z.object({ topic_id: z.number().int().positive(), status: z.enum(['open', 'locked', 'hidden']), pinned: z.boolean() });
export const ForumPostEditSchema = z.object({ post_id: z.number().int().positive(), body: z.string().trim().min(1).max(5000) });

// =========================================================================================================
// Response schemas — shared frontend/backend, frontend safeParse sin as
// =========================================================================================================

export const HealthResponseSchema = z.object({ status: z.string(), version: z.string(), db: z.string() });
export const UserResponseSchema = z.object({
	user: z.object({ id: z.number(), username: z.string(), roles: z.array(z.string()).optional(), permissions: z.array(PermissionSchema).optional(), display_name: z.string().nullable().optional(), status: z.string().optional() }).nullable(),
});
export const TurnstileConfigResponseSchema = z.object({ siteKey: z.string().min(1) });
export const PublicProfileSchema = z.object({ id: z.number(), username: z.string(), display_name: z.string().nullable(), avatar_url: z.string().nullable(), bio: z.string().nullable(), roles: z.array(z.string()), created_at: z.number() });
export const ProfileResponseSchema = z.object({ profile: PublicProfileSchema });
export const ProfilePostsResponseSchema = z.object({
	data: z.array(z.object({ public_id: z.string(), low_variant_key: z.string(), preview_data: z.string().nullable().optional(), score: z.number(), favorite_count: z.number(), media_type: z.string() })),
	nextCursor: z.string().nullable(),
});
export const AutocompleteResponseSchema = z.object({ tags: z.array(z.object({ name: z.string(), display: z.string().nullable().optional(), usage: z.number().optional() })) });
export const TagEditResponseSchema = z.object({
	id: z.number(),
	normalized_name: z.string(),
	display_name: z.string().nullable(),
	description: z.string().nullable(),
	category: z.enum(TAG_CATEGORIES),
	usage_count: z.number(),
	status: z.string(),
});
export const TagDirectoryResponseSchema = z.object({ data: z.array(TagEditResponseSchema), nextCursor: z.number().nullable() });
export const AliasItemSchema = z.object({ id: z.number(), alias_normalized: z.string(), normalized_name: z.string(), tag_id: z.number(), created_at: z.number() });
export const AliasDirectoryResponseSchema = z.object({ data: z.array(AliasItemSchema), nextCursor: z.number().nullable() });
export const TagItemSchema = z.object({ name: z.string(), display: z.string().nullable().optional(), usage: z.number() });
export const BrowseTagsQuerySchema = z.object({
	category: z.enum(TAG_CATEGORIES).optional().catch(undefined),
	limit: z.coerce.number().int().min(1).max(100).catch(50).default(50),
	offset: z.coerce.number().int().min(0).catch(0).default(0),
});
export const BrowseTagsResponseSchema = z.object({
	groups: z.record(z.enum(TAG_CATEGORIES), z.object({ tags: z.array(TagItemSchema) })),
});
export const GridItemSchema = z.object({
	public_id: z.string(),
	low_variant_key: z.string().nullable().optional(),
	preview_data: z.string().nullable().optional(),
	score: z.number(),
	favorite_count: z.number(),
	media_type: z.string().optional(),
	tags: z.array(z.string()).optional(),
});
export const PostTagSchema = z.object({ name: z.string(), category: z.string(), count: z.number() });
export const SearchResponseSchema = z.object({ data: z.array(GridItemSchema), tags: z.array(PostTagSchema), nextCursor: z.string().nullable(), hasMore: z.boolean(), warning: z.string().optional() });
export const PostResponseSchema = z.object({
	public_id: z.string().optional(),
	publicId: z.string().optional(),
	preview_data: z.string().nullable().optional(),
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
	author_id: z.number().optional(),
	restricted: z.boolean().optional(),
	redirectTo: z.string().optional(),
});
export const CreatePostResponseSchema = z.object({ publicId: z.string(), postId: z.number(), status: z.string().optional() });
export const FavoritesResponseSchema = z.object({ data: z.array(GridItemSchema), nextCursor: z.string().nullable().optional(), hasMore: z.boolean().optional() });
export const TotpSetupResponseSchema = z.object({ secret: z.string(), uri: z.string() });
export const TotpVerifyResponseSchema = z.object({ ok: z.boolean(), recoveryCodes: z.array(z.string()).optional() });
export const CommentItemSchema = z.object({ id: z.number(), body: z.string(), post_id: z.number(), author_id: z.number(), author_username: z.string().nullable().optional(), created_at: z.number().optional() });
export const CommentListResponseSchema = z.object({ data: z.array(CommentItemSchema) });
export const CommunityListResponseSchema = z.object({ data: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))) });
export const TopResponseSchema = z.object({
	data: z.array(z.object({ public_id: z.string(), media_type: z.string(), low_variant_key: z.string(), preview_data: z.string().nullable().optional(), score: z.number(), favorite_count: z.number(), comment_count: z.number() })),
});

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
export type TurnstileAction = z.infer<typeof TurnstileActionSchema>;
export type ProfileInput = z.infer<typeof ProfileSchema>;
export type ProfilePostsQueryInput = z.infer<typeof ProfilePostsQuerySchema>;
export type Permission = z.infer<typeof PermissionSchema>;
export type CreateRoleInput = z.infer<typeof CreateRoleSchema>;
export type UpdateRoleInput = z.infer<typeof UpdateRoleSchema>;
