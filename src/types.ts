// =========================================================================================================
// SHARED API TYPES (v2)
// =========================================================================================================
// API contracts (not DB rows). Frontend has its own copy — never import backend types there.
// =========================================================================================================

import type { ReportRow, CommentRow } from './db/schema';
import type { ZodIssue } from 'zod';

export type UserRank = 'new' | 'normal' | 'trusted' | 'restricted' | 'banned';
export type UserStatus = 'active' | 'restricted' | 'banned';
export type PostStatus = 'uploading' | 'processing' | 'available' | 'duplicate' | 'rejected' | 'hidden';
export type MediaType = 'image' | 'gif' | 'video';

export interface UserDTO {
	id: number;
	username: string;
	displayName: string | null;
	rank: UserRank;
	status: UserStatus;
	trustScore: number;
	createdAt: number;
}

export interface PostDTO {
	id: string;
	author: UserDTO | null;
	mediaType: MediaType;
	status: PostStatus;
	title: string | null;
	score: number;
	favoriteCount: number;
	commentCount: number;
	lowVariantKey: string | null;
	mediumVariantKey: string | null;
	createdAt: number;
	publishedAt: number | null;
	canonicalPostId: number | null;
	tags: string[];
}

export interface TagDTO {
	id: number;
	normalizedName: string;
	displayName: string | null;
	category: string;
	usageCount: number;
}

export interface CommentDTO {
	id: number;
	postId: number;
	author: UserDTO;
	body: string;
	parentId: number | null;
	createdAt: number;
	status: string;
}

export interface PaginatedResponse<T> {
	data: T[];
	pagination: { page: number; limit: number; total: number };
	hasMore?: boolean;
	nextCursor?: string | null;
}

export interface AuthUser {
	id: number;
	username: string;
	rank: UserRank;
	status: UserStatus;
	isAdmin: boolean;
}

// =========================================================================================================
// Primitive helpers — zero unknown
// =========================================================================================================

export type SqlParam = string | number | boolean | null | ArrayBuffer | Uint8Array;
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
export type ErrorDetails = JsonValue | ZodIssue[] | readonly ZodIssue[] | ({ redirectTo?: string; retryAfter?: number } & Record<string, JsonValue>);

export type QueueMessage =
	| { type: 'process_media'; postId: number }
	| { type: 'recalculate_post_score'; postId: number }
	| { type: 'update_tag_usage' }
	| { type: 'cleanup_expired_sessions' };

export type PostSearchResult = import('./db/schema').PostListingRow;
export type PostDetailResult = import('./db/schema').PostListingRow & {
	author_id: number;
	title: string | null;
	description: string | null;
	canonical_post_id: number | null;
	tags: string[];
	restricted?: boolean;
	lowVariantKey?: string | null;
	mediumVariantKey?: string | null;
};

// =========================================================================================================
// Utility-derived entity results (never inline { id: number })
// =========================================================================================================

export type EntityId = Pick<ReportRow, 'id'>;
export type CreatedReportResult = Pick<ReportRow, 'id'>;
export type CreatedCommentResult = Pick<CommentRow, 'id'>;
export type CreatedPostResult = { publicId: string; postId: number };

// =========================================================================================================
// Service input helpers — reuse validator inferences + Row field types via indexed access
// =========================================================================================================

export type { ReportInput, ModerationActionInput, CreatePostInput, CommentInput } from './validators';
