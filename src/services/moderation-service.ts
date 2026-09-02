// =========================================================================================================
// MODERATION SERVICE (v2)
// =========================================================================================================
// Reports + actions. Trusted-only gating in service (not middleware).
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import type { DB } from '../db/client';
import { ForbiddenError } from '../domain/errors';
import type { AuthUser } from '../types';
import * as moderationRepo from '../repositories/moderation-repository';

// =========================================================================================================
// Service
// =========================================================================================================

export class ModerationService {
	constructor(private readonly db: DB) {}

	private assertTrusted(viewer: AuthUser): void {
		if (!viewer.isAdmin) throw new ForbiddenError('solo trusted');
	}

	async report(viewer: AuthUser, input: { target_type: string; target_id: number; reason: string }): Promise<{ id: number }> {
		const id = await moderationRepo.createReport(this.db, { reporterId: viewer.id, targetType: input.target_type, targetId: input.target_id, reason: input.reason });
		return { id };
	}

	async act(viewer: AuthUser, input: { target_type: string; target_id: number; action: string; reason?: string | null }): Promise<{ id: number }> {
		this.assertTrusted(viewer);
		const allowed = ['hide', 'reject', 'ban', 'restrict', 'approve'] as const;
		if (!(allowed as readonly string[]).includes(input.action)) throw new ForbiddenError('accion no permitida');
		const id = await moderationRepo.createAction(this.db, { targetType: input.target_type, targetId: input.target_id, moderatorId: viewer.id, action: input.action, reason: input.reason ?? null });
		return { id };
	}

	async listReports(viewer: AuthUser): Promise<unknown[]> {
		this.assertTrusted(viewer);
		return moderationRepo.listOpenReports(this.db);
	}
}
