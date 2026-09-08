// =========================================================================================================
// MODERATION REPOSITORY (v2)
// =========================================================================================================
// ONLY place with SQL for reports + moderation_actions.
// =========================================================================================================

import { queryAll, queryOne, batch, type DB } from '../db/client';
import type { ReportRow, ModerationActionRow } from '../db/schema';

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

export async function createReport(db: DB, data: CreateReportData): Promise<ReportRow['id']> {
	const now = Date.now();
	const nextId = (await queryOne<{ v: number }>(db, 'SELECT COALESCE(MAX(id),0)+1 as v FROM reports', []))?.v ?? 1;

	await batch(db, [
		db.prepare('INSERT INTO reports (id, reporter_id, target_type, target_id, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(nextId, data.reporterId, data.targetType, data.targetId, data.reason, 'open', now),
	]);

	return nextId;
}

export async function createAction(db: DB, data: CreateActionData): Promise<ModerationActionRow['id']> {
	const now = Date.now();
	const nextId = (await queryOne<{ v: number }>(db, 'SELECT COALESCE(MAX(id),0)+1 as v FROM moderation_actions', []))?.v ?? 1;

	const stmts: D1PreparedStatement[] = [
		db
			.prepare('INSERT INTO moderation_actions (id, target_type, target_id, moderator_id, action, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
			.bind(nextId, data.targetType, data.targetId, data.moderatorId, data.action, data.reason ?? null, now),
	];

	if (data.targetType === 'post' && data.action === 'hide') {
		stmts.push(db.prepare("UPDATE posts SET status = 'hidden', updated_at = ? WHERE id = ?").bind(now, data.targetId));
		stmts.push(db.prepare("UPDATE post_listing SET status = 'hidden' WHERE post_id = ?").bind(data.targetId));
	}

	if (data.targetType === 'post' && data.action === 'reject') {
		stmts.push(db.prepare("UPDATE posts SET status = 'rejected', updated_at = ? WHERE id = ?").bind(now, data.targetId));
	}

	if (data.targetType === 'user' && data.action === 'ban') {
		stmts.push(db.prepare("UPDATE users SET status = 'banned', rank = 'banned' WHERE id = ?").bind(data.targetId));
	}

	await batch(db, stmts);

	return nextId;
}

export async function listOpenReports(db: DB, limit = 50): Promise<ReportRow[]> {
	return queryAll<ReportRow>(db, "SELECT * FROM reports WHERE status = 'open' ORDER BY created_at DESC LIMIT ?", [limit]);
}
