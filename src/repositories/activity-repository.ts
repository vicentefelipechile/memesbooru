// =========================================================================================================
// ACTIVITY REPOSITORY (v2)
// =========================================================================================================
// ONLY place with SQL for user_activity + user_rank_history.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { queryOne, batch, execute, type DB } from '../db/client';
import type { UserActivityRow, UserRow } from '../db/schema';

// =========================================================================================================
// Queries
// =========================================================================================================

export class ActivityRepository {
	constructor(private readonly db: DB) {}

	async getLastUploadAt(userId: number): Promise<number | null> {
		const row = await queryOne<Pick<UserActivityRow, 'last_upload_at'>>(this.db, 'SELECT last_upload_at FROM user_activity WHERE user_id = ?', [userId]);
		return row?.last_upload_at ?? null;
	}

	async getActivity(userId: number): Promise<Pick<UserActivityRow, 'approved_posts'> | null> {
		return queryOne<Pick<UserActivityRow, 'approved_posts'>>(this.db, 'SELECT approved_posts FROM user_activity WHERE user_id = ?', [userId]);
	}

	async getUserRankMeta(userId: number): Promise<Pick<UserRow, 'rank' | 'created_at'> | null> {
		return queryOne<Pick<UserRow, 'rank' | 'created_at'>>(this.db, 'SELECT rank, created_at FROM users WHERE id = ?', [userId]);
	}

	// =========================================================================================================
	// Commands
	// =========================================================================================================

	async updateLastUploadAt(userId: number, now = Date.now()): Promise<void> {
		await execute(this.db, 'UPDATE user_activity SET last_upload_at = ?, updated_at = ? WHERE user_id = ?', [now, now, userId]);
	}

	async promoteToNormal(userId: number): Promise<void> {
		const now = Date.now();
		await batch(this.db, [
			this.db.prepare("UPDATE users SET rank = 'normal' WHERE id = ?").bind(userId),
			this.db.prepare('INSERT INTO user_rank_history (user_id, previous_rank, new_rank, reason, created_at) VALUES (?, ?, ?, ?, ?)').bind(userId, 'new', 'normal', 'auto-promote', now),
		]);
	}
}
