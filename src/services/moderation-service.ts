// =========================================================================================================
// MODERATION SERVICE (v2)
// =========================================================================================================
// Reports + actions. Trusted-only gating in service (not middleware).
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import type { DB } from '../db/client';
import { batch } from '../db/client';
import { NotFoundError, ForbiddenError } from '../domain/errors';
import type { AuthUser } from '../types';

// =========================================================================================================
// Service
// =========================================================================================================

export class ModerationService {
	constructor(private readonly db: DB) {}

	private assertTrusted(viewer: AuthUser): void {
		if (!viewer.isAdmin) throw new ForbiddenError('solo trusted');
	}

	async report(viewer: AuthUser, input: { target_type: string; target_id: number; reason: string }): Promise<{ id: number }> {
		const now = Date.now();
		const id = (await this.db.prepare('SELECT COALESCE(MAX(id),0)+1 as v FROM reports').first<{ v: number }>())?.v ?? 1;
		await this.db.prepare('INSERT INTO reports (id, reporter_id, target_type, target_id, reason, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, viewer.id, input.target_type, input.target_id, input.reason, 'open', now).run();
		return { id };
	}

	async act(viewer: AuthUser, input: { target_type: string; target_id: number; action: string; reason?: string }): Promise<{ id: number }> {
		this.assertTrusted(viewer);
		const allowed = ['hide', 'reject', 'ban', 'restrict', 'approve'];
		if (!allowed.includes(input.action)) throw new ForbiddenError('accion no permitida');
		const now = Date.now();
		const id = (await this.db.prepare('SELECT COALESCE(MAX(id),0)+1 as v FROM moderation_actions').first<{ v: number }>())?.v ?? 1;
		const stmts: D1PreparedStatement[] = [
			this.db
				.prepare('INSERT INTO moderation_actions (id, target_type, target_id, moderator_id, action, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
				.bind(id, input.target_type, input.target_id, viewer.id, input.action, input.reason ?? null, now),
		];
		if (input.target_type === 'post' && input.action === 'hide') {
			stmts.push(this.db.prepare("UPDATE posts SET status = 'hidden', updated_at = ? WHERE id = ?").bind(now, input.target_id));
			stmts.push(this.db.prepare("UPDATE post_listing SET status = 'hidden' WHERE post_id = ?").bind(input.target_id));
		}
		if (input.target_type === 'post' && input.action === 'reject') stmts.push(this.db.prepare("UPDATE posts SET status = 'rejected', updated_at = ? WHERE id = ?").bind(now, input.target_id));
		if (input.target_type === 'user' && input.action === 'ban') stmts.push(this.db.prepare("UPDATE users SET status = 'banned', rank = 'banned' WHERE id = ?").bind(input.target_id));
		await batch(this.db, stmts);
		return { id };
	}

	async listReports(viewer: AuthUser): Promise<unknown[]> {
		this.assertTrusted(viewer);
		const { results } = await this.db.prepare("SELECT * FROM reports WHERE status = 'open' ORDER BY created_at DESC LIMIT 50").all();
		return results ?? [];
	}
}
