// =========================================================================================================
// DB PROJECTIONS (v2)
// =========================================================================================================
// Central query projections — single source for repeated queryOne/queryAll shapes (never inline { v: number }).
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import type { PostListingRow, PostRow } from './schema';

// =========================================================================================================
// Consts
// =========================================================================================================

export const VISIBLE_COMMENT_PREDICATE = "status = 'visible'" as const;
export const AVAILABLE_POST_PREDICATE = "status = 'available'" as const;

// =========================================================================================================
// Types
// =========================================================================================================

export type NextIdRow = { v: number };
export type CountRow = { c: number };
export type PostDetailRow = PostListingRow & Pick<PostRow, 'author_id' | 'title' | 'description' | 'canonical_post_id'>;

export interface UserTotpRow {
	user_id: number;
	secret_encrypted: Uint8Array;
	is_verified: number;
	created_at: number;
	verified_at: number | null;
}
