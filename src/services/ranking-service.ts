// =========================================================================================================
// RANKING SERVICE (v2)
// =========================================================================================================
// Cooldowns + promotion. Pure business rules, no Hono.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import type { DB } from '../db/client';
import { ActivityRepository } from '../repositories/activity-repository';
import type { UserRow } from '../db/schema';

// =========================================================================================================
// Types
// =========================================================================================================

export type CooldownResult = { allowed: boolean; retryAfter?: number };

// =========================================================================================================
// Service
// =========================================================================================================

export class RankingService {
	private readonly activity: ActivityRepository;

	constructor(private readonly db: DB) {
		this.activity = new ActivityRepository(db);
	}

	async checkUploadCooldown(userId: number, rank: UserRow['rank']): Promise<CooldownResult> {
		if (rank !== 'new') return { allowed: true };

		const last = (await this.activity.getLastUploadAt(userId)) ?? 0;
		const elapsed = Date.now() - last;

		if (elapsed < 3600 * 1000) return { allowed: false, retryAfter: 3600 * 1000 - elapsed };

		return { allowed: true };
	}

	async recordUpload(userId: number): Promise<void> {
		await this.activity.updateLastUploadAt(userId);
	}

	async maybePromote(userId: number): Promise<void> {
		const activity = await this.activity.getActivity(userId);
		const user = await this.activity.getUserRankMeta(userId);

		if (!user || !activity) return;

		if (user.rank === 'new' && activity.approved_posts >= 3 && Date.now() - user.created_at > 7 * 24 * 3600 * 1000) {
			await this.activity.promoteToNormal(userId);
		}
	}
}
