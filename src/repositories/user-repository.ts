// =========================================================================================================
// USER REPOSITORY (v2)
// =========================================================================================================
// ONLY place with SQL for users + google_identities + user_activity.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { queryOne, queryAll, execute, batch, type DB } from '../db/client';
import type { UserRow, GoogleIdentityRow, UserActivityRow, NextIdRow, CountRow } from '../db/schema';

// =========================================================================================================
// Types
// =========================================================================================================

export type { UserRow };

export type InsertUserStatementData = {
	id: UserRow['id'];
	username: UserRow['username'];
	rank: UserRow['rank'];
	status: UserRow['status'];
	trustScore: UserRow['trust_score'];
	createdAt: UserRow['created_at'];
};

export type InsertGoogleIdentityStatementData = {
	userId: GoogleIdentityRow['user_id'];
	googleSubject: GoogleIdentityRow['google_subject'];
	createdAt: GoogleIdentityRow['created_at'];
};

export type InsertUserActivityStatementData = {
	userId: GoogleIdentityRow['user_id'];
	updatedAt: UserActivityRow['updated_at'];
};

export type ListUsersParams = {
	page: number;
	limit: number;
};

// =========================================================================================================
// Queries
// =========================================================================================================

export class UserRepository {
	constructor(private readonly db: DB) {}

	async findById(id: number): Promise<UserRow | null> {
		return queryOne<UserRow>(this.db, 'SELECT * FROM users WHERE id = ?', [id]);
	}

	async findByUsername(username: string): Promise<UserRow | null> {
		return queryOne<UserRow>(this.db, 'SELECT * FROM users WHERE username = ?', [username]);
	}

	async findByGoogleSubject(sub: string): Promise<UserRow | null> {
		return queryOne<UserRow>(this.db, 'SELECT u.* FROM users u JOIN google_identities g ON g.user_id = u.id WHERE g.google_subject = ?', [sub]);
	}

	async findGoogleIdentity(userId: number): Promise<GoogleIdentityRow | null> {
		return queryOne<GoogleIdentityRow>(this.db, 'SELECT * FROM google_identities WHERE user_id = ?', [userId]);
	}

	async count(): Promise<number> {
		const row = await queryOne<CountRow>(this.db, 'SELECT COUNT(*) as c FROM users', []);
		return row?.c ?? 0;
	}

	async list(params: ListUsersParams): Promise<UserRow[]> {
		const offset = (params.page - 1) * params.limit;
		return queryAll<UserRow>(this.db, 'SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?', [params.limit, offset]);
	}

	// =========================================================================================================
	// Builders
	// =========================================================================================================

	buildInsertUserStatement(row: InsertUserStatementData): D1PreparedStatement {
		return this.db.prepare('INSERT INTO users (id, username, rank, status, trust_score, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(row.id, row.username, row.rank, row.status, row.trustScore, row.createdAt);
	}

	buildInsertGoogleIdentityStatement(row: InsertGoogleIdentityStatementData): D1PreparedStatement {
		return this.db.prepare('INSERT INTO google_identities (user_id, google_subject, created_at) VALUES (?, ?, ?)').bind(row.userId, row.googleSubject, row.createdAt);
	}

	buildInsertUserActivityStatement(row: InsertUserActivityStatementData): D1PreparedStatement {
		return this.db.prepare('INSERT INTO user_activity (user_id, updated_at) VALUES (?, ?)').bind(row.userId, row.updatedAt);
	}

	// =========================================================================================================
	// Commands
	// =========================================================================================================

	async createFromGoogle(sub: string, username: string): Promise<UserRow> {
		const now = Date.now();
		const nextId = (await queryOne<NextIdRow>(this.db, 'SELECT COALESCE(MAX(id),0)+1 as v FROM users', []))?.v ?? 1;

		await batch(this.db, [
			this.buildInsertUserStatement({ id: nextId, username, rank: 'new', status: 'active', trustScore: 0, createdAt: now }),
			this.buildInsertGoogleIdentityStatement({ userId: nextId, googleSubject: sub, createdAt: now }),
			this.buildInsertUserActivityStatement({ userId: nextId, updatedAt: now }),
		]);

		const created = await this.findById(nextId);

		if (!created) throw new Error('create user failed');

		return created;
	}

	async updateLastLogin(userId: number): Promise<void> {
		const now = Date.now();

		await batch(this.db, [
			this.db.prepare('UPDATE users SET last_login_at = ?, last_activity_at = ? WHERE id = ?').bind(now, now, userId),
			this.db.prepare('UPDATE google_identities SET last_login_at = ? WHERE user_id = ?').bind(now, userId),
		]);
	}
}
