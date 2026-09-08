// =========================================================================================================
// RANKING SERVICE (v2)
// =========================================================================================================
// Cooldowns + promotion. Pure business rules, no Hono.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import type { DB } from '../db/client';
import * as activityRepo from '../repositories/activity-repository';
import type { UserRow } from '../db/schema';

export type CooldownResult = { allowed: boolean; retryAfter?: number };

// =========================================================================================================
// Service
// =========================================================================================================

export class RankingService {
	constructor(private readonly db: DB) {}

	async checkUploadCooldown(userId: number, rank: UserRow['rank']): Promise<CooldownResult> {
		if (rank !== 'new') return { allowed: true };

		const last = (await activityRepo.getLastUploadAt(this.db, userId)) ?? 0;
		const elapsed = Date.now() - last;

		if (elapsed < 3600 * 1000) return { allowed: false, retryAfter: 3600 * 1000 - elapsed };

		return { allowed: true };
	}

	async recordUpload(userId: number): Promise<void> {
		await activityRepo.updateLastUploadAt(this.db, userId);
	}

	async maybePromote(userId: number): Promise<void> {
		const activity = await activityRepo.getActivity(this.db, userId);
		const user = await activityRepo.getUserRankMeta(this.db, userId);

		if (!user || !activity) return;

		if (user.rank === 'new' && activity.approved_posts >= 3 && Date.now() - user.created_at > 7 * 24 * 3600 * 1000) {
			await activityRepo.promoteToNormal(this.db, userId);
		}
	}
}
