// =========================================================================================================
// MODERATION SERVICE (v2)
// =========================================================================================================
// Reports + actions. Trusted-only gating in service (not middleware).
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import type { DB } from '../db/client';
import { ForbiddenError, NotFoundError, ValidationError } from '../domain/errors';
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
	private readonly permission: PermissionService;

	constructor(private readonly db: DB) {
		this.moderation = new ModerationRepository(db);
		this.permission = new PermissionService(db);
	}

	private assertModerator(viewer: AuthUser): void {
		this.permission.require(viewer, 'moderate');
	}

	async report(viewer: AuthUser, input: ReportInput): Promise<CreatedReportResult> {
		new PermissionService(this.db).require(viewer, 'report');
		await this.assertTargetExists(input.target_type, input.target_id);

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
		if (!((input.target_type === 'post' && (input.action === 'hide' || input.action === 'reject')) || (input.target_type === 'user' && input.action === 'ban'))) throw new ValidationError('Unsupported moderation action');
		await this.assertTargetExists(input.target_type, input.target_id);

		if (input.target_type === 'user' && input.action === 'ban' && (await this.permission.userRolesForLogin(input.target_id)).some((role) => role.id === 1)) throw new ForbiddenError('Revoke administrator role before banning');

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

	private async assertTargetExists(type: ReportInput['target_type'], id: number): Promise<void> {
		if (!(await this.moderation.findTarget(type, id))) throw new NotFoundError('Target not found');
	}
}
