// =========================================================================================================
// SHARED API TYPES (v2)
// =========================================================================================================
// API contracts (not DB rows). Frontend has its own copy — never import backend types there.
// =========================================================================================================

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
