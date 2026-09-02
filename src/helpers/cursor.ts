// =========================================================================================================
// CURSOR HELPERS (v2)
// =========================================================================================================
// Opaque cursor encode/decode. Single implementation — repositories and services must reuse this.
// Cursor payloads are derived from Row types via Pick/Partial to avoid inline anon types.
// =========================================================================================================

import type { CommentRow, PostListingRow } from '../db/schema';

export type CommentCursor = Pick<CommentRow, 'created_at' | 'id'>;
export type PostCursor = { id: PostListingRow['post_id'] } & Partial<Pick<PostListingRow, 'score' | 'published_at'>>;

export function encodeCursor(obj: Record<string, unknown>): string {
	return btoa(JSON.stringify(obj));
}

export function decodeCursor<T>(c: string): T | null {
	try {
		return JSON.parse(atob(c)) as T;
	} catch {
		return null;
	}
}
