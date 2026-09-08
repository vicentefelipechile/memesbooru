// =========================================================================================================
// SHARED API TYPES (v2)
// =========================================================================================================
// API contracts (not DB rows). Frontend has its own copy — never import backend types there.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import type { ReportRow, CommentRow, PostRow, PostListingRow } from './db/schema';
import type { ZodIssue } from 'zod';

export type { SqlParam } from './db/client';

export type UserRank = 'new' | 'normal' | 'trusted' | 'restricted' | 'banned';
export type UserStatus = 'active' | 'restricted' | 'banned';
export type PostStatus = 'uploading' | 'processing' | 'available' | 'duplicate' | 'rejected' | 'hidden';
export type MediaType = 'image' | 'gif' | 'video';

export interface UserDTO {
	id: UserId;
	username: string;
	displayName: string | null;
	rank: UserRank;
	status: UserStatus;
	trustScore: number;
	createdAt: number;
}

export type PostDTO = DeepReadonly<
	CamelCased<Omit<PostRow, 'author_id' | 'public_id' | 'canonical_post_id'>> & {
		id: PublicId;
		author: UserDTO | null;
		mediaType: MediaType;
		status: PostStatus;
		canonicalPostId: PostId | null;
		tags: string[];
		lowVariantKey: string | null;
		mediumVariantKey: string | null;
	}
>;

export interface TagDTO {
	id: number;
	normalizedName: string;
	displayName: string | null;
	category: string;
	usageCount: number;
}

export interface CommentDTO {
	id: CommentId;
	postId: PostId;
	author: UserDTO;
	body: string;
	parentId: CommentId | null;
	createdAt: number;
	status: string;
}

// Post detail tag — enriched with category + usage count for the booru sidebar.
export interface PostTagResult {
	name: string;
	category: string;
	count: number;
}

export interface PaginatedResponse<T> {
	data: T[];
	pagination: { page: number; limit: number; total: number };
	hasMore?: boolean;
	nextCursor?: string | null;
}

export interface AuthUser {
	id: UserId;
	username: string;
	rank: UserRank;
	status: UserStatus;
	isAdmin: boolean;
}

// =========================================================================================================
// Primitive helpers — zero unknown
// =========================================================================================================

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type ErrorDetails = JsonValue | ZodIssue[] | readonly ZodIssue[] | ({ redirectTo?: string; retryAfter?: number } & Record<string, JsonValue>);

// Branded IDs — nominal typing to prevent mixing number ids
declare const Brand: unique symbol;
export type Brand<T, B extends string> = T & { readonly [Brand]: B };
export type UserId = Brand<number, 'UserId'>;
export type PostId = Brand<number, 'PostId'>;
export type PublicId = Brand<string, 'PublicId'>;
export type TagId = Brand<number, 'TagId'>;
export type CommentId = Brand<number, 'CommentId'>;

export const toUserId = (n: number): UserId => n as UserId;
export const toPostId = (n: number): PostId => n as PostId;
export const toPublicId = (s: string): PublicId => s as PublicId;
export const toTagId = (n: number): TagId => n as TagId;
export const toCommentId = (n: number): CommentId => n as CommentId;

export type QueueMessage =
	| { type: 'process_media'; postId: PostId }
	| { type: 'recalculate_post_score'; postId: PostId }
	| { type: 'update_tag_usage' }
	| { type: 'cleanup_expired_sessions' };

// Snake -> camel mapped type + helpers
type SnakeToCamel<S extends string> = S extends `${infer H}_${infer T}` ? `${H}${Capitalize<SnakeToCamel<T>>}` : S;
export type CamelCased<T> = { [K in keyof T as SnakeToCamel<K & string>]: T[K] };
export type DeepReadonly<T> = T extends (...args: unknown[]) => unknown ? T : { readonly [K in keyof T]: DeepReadonly<T[K]> };
export type NoInfer<T> = [T][T extends unknown ? 0 : never];

// Variadic tuple helper — preserves args tuple for typed wrappers
export type VariadicFn<Args extends readonly unknown[], R> = (...args: Args) => R;
export type AwaitedReturn<T extends (...args: never[]) => Promise<unknown>> = Awaited<ReturnType<T>>;

export type PostSearchResult = PostListingRow;
export type PostDetailResult = PostListingRow & {
	author_id: UserId;
	author_username: string | null;
	title: string | null;
	description: string | null;
	canonical_post_id: PostId | null;
	tags: PostTagResult[];
	restricted?: boolean;
	lowVariantKey?: string | null;
	mediumVariantKey?: string | null;
};

// Comment with author username joined (for the booru comment list).
export type CommentResult = CommentRow & {
	author_username: string | null;
};

// =========================================================================================================
// Utility-derived entity results (never inline { id: number })
// =========================================================================================================

export type EntityId = Pick<ReportRow, 'id'>;
export type CreatedReportResult = Pick<ReportRow, 'id'>;
export type CreatedCommentResult = Pick<CommentRow, 'id'>;
export type CreatedPostResult = { publicId: PublicId; postId: PostId };

// =========================================================================================================
// Service result helpers — named results for service signatures (never inline Promise<{...}>)
// =========================================================================================================

export type SearchResult = {
	data: PostSearchResult[];
	nextCursor: string | null;
	hasMore: boolean;
};

export type TagItem = {
	name: string;
	display: string | null;
	usage: number;
};

export type TagItemsResult = {
	tags: TagItem[];
};

export type BrowseCategoryParams = {
	limit?: number;
	offset?: number;
};

export type BrowseParams = {
	perCategoryLimit?: number;
};

export type SessionTokenPair = {
	token: string;
	hash: ArrayBuffer;
};

export type GoogleTokens = {
	id_token: string;
	access_token: string;
};

export type AuthUserBrief = {
	id: number;
	username: string;
	rank: string;
};

export type SessionVerification = {
	userId: number;
};

// =========================================================================================================
// Export — reuse validator inferences + Row field types via indexed access
// =========================================================================================================

export type { ReportInput, ModerationActionInput, CreatePostInput, CommentInput } from './validators';
