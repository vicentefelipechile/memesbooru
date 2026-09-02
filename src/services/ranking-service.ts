// =========================================================================================================
// RANKING SERVICE (v2)
// =========================================================================================================
// Cooldowns + promotion. Pure business rules, no Hono.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import type { DB } from '../db/client';
import { batch } from '../db/client';

// =========================================================================================================
// Service
// =========================================================================================================

export class RankingService {
	constructor(private readonly db: DB) {}

	async checkUploadCooldown(userId: number, rank: string): Promise<{ allowed: boolean; retryAfter?: number }> {
		if (rank !== 'new') return { allowed: true };
		const row = await this.db.prepare('SELECT last_upload_at FROM user_activity WHERE user_id = ?').bind(userId).first<{ last_upload_at: number | null }>();
		const last = row?.last_upload_at ?? 0;
		const elapsed = Date.now() - last;
		if (elapsed < 3600 * 1000) return { allowed: false, retryAfter: 3600 * 1000 - elapsed };
		return { allowed: true };
	}

	async recordUpload(userId: number): Promise<void> {
		await this.db.prepare('UPDATE user_activity SET last_upload_at = ?, updated_at = ? WHERE user_id = ?').bind(Date.now(), Date.now(), userId).run();
	}

	async maybePromote(userId: number): Promise<void> {
		const activity = await this.db.prepare('SELECT approved_posts FROM user_activity WHERE user_id = ?').bind(userId).first<{ approved_posts: number }>();
		const user = await this.db.prepare('SELECT rank, created_at FROM users WHERE id = ?').bind(userId).first<{ rank: string; created_at: number }>();
		if (!user || !activity) return;
		if (user.rank === 'new' && activity.approved_posts >= 3 && Date.now() - user.created_at > 7 * 24 * 3600 * 1000) {
			await batch(this.db, [
				this.db.prepare("UPDATE users SET rank = 'normal' WHERE id = ?").bind(userId),
				this.db.prepare('INSERT INTO user_rank_history (user_id, previous_rank, new_rank, reason, created_at) VALUES (?, ?, ?, ?, ?)').bind(userId, 'new', 'normal', 'auto-promote', Date.now()),
			]);
		}
	}
}
