// =========================================================================================================
// MODERATION REPOSITORY (v2)
// =========================================================================================================
// ONLY place with SQL for reports + moderation_actions.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { queryAll, queryOne, batch, type DB } from '../db/client';
import type { ReportRow, ModerationActionRow, NextIdRow } from '../db/schema';

// =========================================================================================================
// Repository input types — derived from Row via indexed access / Omit (never re-declare primitives)
// =========================================================================================================

export type CreateReportData = {
	reporterId: ReportRow['reporter_id'];
	targetType: ReportRow['target_type'];
	targetId: ReportRow['target_id'];
	reason: ReportRow['reason'];
};

export type CreateActionData = {
	targetType: ModerationActionRow['target_type'];
	targetId: ModerationActionRow['target_id'];
	moderatorId: ModerationActionRow['moderator_id'];
	action: ModerationActionRow['action'];
	reason?: ModerationActionRow['reason'];
};

// =========================================================================================================
// Queries
// =========================================================================================================

export class ModerationRepository {
	constructor(private readonly db: DB) {}

	async listOpenReports(limit = 50): Promise<ReportRow[]> {
		return queryAll<ReportRow>(this.db, "SELECT id, reporter_id, target_type, target_id, reason, status, created_at FROM reports WHERE status = 'open' ORDER BY created_at DESC LIMIT ?", [limit]);
	}

	// =========================================================================================================
	// Commands
	// =========================================================================================================

	async createReport(data: CreateReportData): Promise<ReportRow['id']> {
		const now = Date.now();
		const nextId = (await queryOne<NextIdRow>(this.db, 'SELECT COALESCE(MAX(id),0)+1 as v FROM reports', []))?.v ?? 1;

		await batch(this.db, [
			this.db.prepare('INSERT INTO reports (id, reporter_id, target_type, target_id, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(nextId, data.reporterId, data.targetType, data.targetId, data.reason, 'open', now),
		]);

		return nextId;
	}
	async createAction(data: CreateActionData): Promise<ModerationActionRow['id']> {
		const now = Date.now();
		const nextId = (await queryOne<NextIdRow>(this.db, 'SELECT COALESCE(MAX(id),0)+1 as v FROM moderation_actions', []))?.v ?? 1;

		const stmts: D1PreparedStatement[] = [
			this.db
				.prepare('INSERT INTO moderation_actions (id, target_type, target_id, moderator_id, action, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
				.bind(nextId, data.targetType, data.targetId, data.moderatorId, data.action, data.reason ?? null, now),
		];

		if (data.targetType === 'post' && data.action === 'hide') {
			stmts.push(this.db.prepare("UPDATE posts SET status = 'hidden', updated_at = ? WHERE id = ?").bind(now, data.targetId));
			stmts.push(this.db.prepare("UPDATE post_listing SET status = 'hidden' WHERE post_id = ?").bind(data.targetId));
		}

		if (data.targetType === 'post' && data.action === 'reject') {
			stmts.push(this.db.prepare("UPDATE posts SET status = 'rejected', updated_at = ? WHERE id = ?").bind(now, data.targetId));
		}

		if (data.targetType === 'user' && data.action === 'ban') {
			stmts.push(this.db.prepare("UPDATE users SET status = 'banned', rank = 'banned' WHERE id = ?").bind(data.targetId));
		}

		await batch(this.db, stmts);

		return nextId;
	}
}
