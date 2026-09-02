// =========================================================================================================
// ACTIVITY REPOSITORY (v2)
// =========================================================================================================
// ONLY place with SQL for user_activity + user_rank_history.
// =========================================================================================================

import { queryOne, batch, type DB } from '../db/client';
import type { UserActivityRow, UserRow } from '../db/schema';

export async function getLastUploadAt(db: DB, userId: number): Promise<number | null> {
	const row = await queryOne<{ last_upload_at: number | null }>(db, 'SELECT last_upload_at FROM user_activity WHERE user_id = ?', [userId]);
	return row?.last_upload_at ?? null;
}

export async function updateLastUploadAt(db: DB, userId: number, now = Date.now()): Promise<void> {
	await queryOne(db, 'UPDATE user_activity SET last_upload_at = ?, updated_at = ? WHERE user_id = ?', [now, now, userId]);
}

export async function getActivity(db: DB, userId: number): Promise<Pick<UserActivityRow, 'approved_posts'> | null> {
	return queryOne<Pick<UserActivityRow, 'approved_posts'>>(db, 'SELECT approved_posts FROM user_activity WHERE user_id = ?', [userId]);
}

export async function getUserRankMeta(db: DB, userId: number): Promise<Pick<UserRow, 'rank' | 'created_at'> | null> {
	return queryOne<Pick<UserRow, 'rank' | 'created_at'>>(db, 'SELECT rank, created_at FROM users WHERE id = ?', [userId]);
}

export async function promoteToNormal(db: DB, userId: number): Promise<void> {
	const now = Date.now();
	await batch(db, [
		db.prepare("UPDATE users SET rank = 'normal' WHERE id = ?").bind(userId),
		db.prepare('INSERT INTO user_rank_history (user_id, previous_rank, new_rank, reason, created_at) VALUES (?, ?, ?, ?, ?)').bind(userId, 'new', 'normal', 'auto-promote', now),
	]);
}
