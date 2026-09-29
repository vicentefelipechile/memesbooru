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
import type { AuthUser, CreatedReportResult } from '../types';
import type { ReportInput, ModerationActionInput } from '../validators';
import type { ReportRow, ModerationActionRow } from '../db/schema';
import { ModerationRepository } from '../repositories/moderation-repository';
import { PermissionService } from './permission-service';

// =========================================================================================================
// Service
// =========================================================================================================

export class ModerationService {
	private readonly moderation: ModerationRepository;

	constructor(private readonly db: DB) {
		this.moderation = new ModerationRepository(db);
	}

	private assertModerator(viewer: AuthUser): void {
		new PermissionService(this.db).require(viewer, 'moderate');
	}

	async report(viewer: AuthUser, input: ReportInput): Promise<CreatedReportResult> {
		new PermissionService(this.db).require(viewer, 'report');
		const id = await this.moderation.createReport({
			reporterId: viewer.id,
			targetType: input.target_type,
			targetId: input.target_id,
			reason: input.reason,
		});

		return { id };
	}

	async act(viewer: AuthUser, input: ModerationActionInput): Promise<Pick<ModerationActionRow, 'id'>> {
		this.assertModerator(viewer);
		if (input.target_type === 'user' && input.action === 'ban' && (await new PermissionService(this.db).userRolesForLogin(input.target_id)).some((role) => role.id === 1)) throw new ForbiddenError('Revoke administrator role before banning');

		const allowed = ['hide', 'reject', 'ban', 'restrict', 'approve'] as const;

		if (!(allowed as readonly string[]).includes(input.action)) throw new ForbiddenError('accion no permitida');

		const id = await this.moderation.createAction({
			targetType: input.target_type,
			targetId: input.target_id,
			moderatorId: viewer.id,
			action: input.action,
			reason: input.reason ?? null,
		});

		return { id };
	}

	async listReports(viewer: AuthUser): Promise<ReportRow[]> {
		this.assertModerator(viewer);

		return this.moderation.listOpenReports();
	}
}
