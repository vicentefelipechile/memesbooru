// =========================================================================================================
// PROFILE REPOSITORY
// =========================================================================================================
// Public account projection and authored posts; never reads credentials.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { execute, queryAll, queryOne, type DB } from '../db/client';
import type { PostRow, PostListingRow } from '../db/schema';
import type { ProfileInput } from '../validators';
import type { UserRow } from '../db/schema';

// =========================================================================================================
// Types
// =========================================================================================================

export type ProfilePostRow = Pick<PostRow, 'id' | 'created_at'> & Pick<PostListingRow, 'public_id' | 'low_variant_key' | 'preview_data' | 'score' | 'favorite_count' | 'media_type'>;
export type ProfilePostCursor = Pick<PostRow, 'id' | 'created_at'>;
export type ProfileRow = Pick<UserRow, 'id' | 'username' | 'display_name' | 'avatar_url' | 'bio' | 'created_at'>;

// =========================================================================================================
// Repository
// =========================================================================================================

export class ProfileRepository {
	constructor(private readonly db: DB) {}

	findByUsername(username: string): Promise<ProfileRow | null> {
		return queryOne<ProfileRow>(this.db, "SELECT id, username, display_name, avatar_url, bio, created_at FROM users WHERE username = ? AND status != 'banned'", [username]);
	}

	findById(id: number): Promise<ProfileRow | null> {
		return queryOne<ProfileRow>(this.db, 'SELECT id, username, display_name, avatar_url, bio, created_at FROM users WHERE id = ?', [id]);
	}

	listPosts(authorId: number, limit: number, cursor: ProfilePostCursor | null): Promise<ProfilePostRow[]> {
		const filter = cursor ? 'AND (p.created_at < ? OR (p.created_at = ? AND p.id < ?))' : '';
		const params = cursor ? [authorId, cursor.created_at, cursor.created_at, cursor.id, limit] : [authorId, limit];

		return queryAll<ProfilePostRow>(
			this.db,
			`SELECT p.id, p.created_at, pl.public_id, pl.low_variant_key, pl.preview_data, pl.score, pl.favorite_count, pl.media_type
			 FROM posts p JOIN post_listing pl ON pl.post_id = p.id
			 WHERE p.author_id = ? AND p.status = 'available' AND pl.status = 'available' ${filter}
			 ORDER BY p.created_at DESC, p.id DESC LIMIT ?`,
			params,
		);
	}

	async update(id: number, input: ProfileInput): Promise<void> {
		await execute(this.db, 'UPDATE users SET display_name = ?, bio = ?, avatar_url = ? WHERE id = ?', [input.display_name, input.bio, input.avatar_url, id]);
	}
}
