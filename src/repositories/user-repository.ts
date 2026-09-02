// =========================================================================================================
// USER REPOSITORY (v2)
// =========================================================================================================
// ONLY place with SQL for users + google_identities + user_activity.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { queryOne, queryAll, execute, batch, type DB } from '../db/client';
import type { UserRow, GoogleIdentityRow } from '../db/schema';

// =========================================================================================================
// Row helpers
// =========================================================================================================

export type { UserRow };

// =========================================================================================================
// Queries
// =========================================================================================================

export async function findById(db: DB, id: number): Promise<UserRow | null> {
	return queryOne<UserRow>(db, 'SELECT * FROM users WHERE id = ?', [id]);
}

export async function findByUsername(db: DB, username: string): Promise<UserRow | null> {
	return queryOne<UserRow>(db, 'SELECT * FROM users WHERE username = ?', [username]);
}

export async function findByGoogleSubject(db: DB, sub: string): Promise<UserRow | null> {
	return queryOne<UserRow>(db, 'SELECT u.* FROM users u JOIN google_identities g ON g.user_id = u.id WHERE g.google_subject = ?', [sub]);
}

export async function findGoogleIdentity(db: DB, userId: number): Promise<GoogleIdentityRow | null> {
	return queryOne<GoogleIdentityRow>(db, 'SELECT * FROM google_identities WHERE user_id = ?', [userId]);
}

// =========================================================================================================
// Builders (for batch composition)
// =========================================================================================================

export function buildInsertUserStatement(db: DB, row: { id: number; username: string; rank: string; status: string; trustScore: number; createdAt: number }): D1PreparedStatement {
	return db.prepare('INSERT INTO users (id, username, rank, status, trust_score, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(row.id, row.username, row.rank, row.status, row.trustScore, row.createdAt);
}

export function buildInsertGoogleIdentityStatement(db: DB, row: { userId: number; googleSubject: string; createdAt: number }): D1PreparedStatement {
	return db.prepare('INSERT INTO google_identities (user_id, google_subject, created_at) VALUES (?, ?, ?)').bind(row.userId, row.googleSubject, row.createdAt);
}

export function buildInsertUserActivityStatement(db: DB, row: { userId: number; updatedAt: number }): D1PreparedStatement {
	return db.prepare('INSERT INTO user_activity (user_id, updated_at) VALUES (?, ?)').bind(row.userId, row.updatedAt);
}

// =========================================================================================================
// Commands
// =========================================================================================================

export async function createFromGoogle(db: DB, sub: string, username: string): Promise<UserRow> {
	const now = Date.now();
	const nextId = (await queryOne<{ v: number }>(db, 'SELECT COALESCE(MAX(id),0)+1 as v FROM users', []))?.v ?? 1;
	await batch(db, [
		buildInsertUserStatement(db, { id: nextId, username, rank: 'new', status: 'active', trustScore: 0, createdAt: now }),
		buildInsertGoogleIdentityStatement(db, { userId: nextId, googleSubject: sub, createdAt: now }),
		buildInsertUserActivityStatement(db, { userId: nextId, updatedAt: now }),
	]);
	const created = await findById(db, nextId);
	if (!created) throw new Error('create user failed');
	return created;
}

export async function updateLastLogin(db: DB, userId: number): Promise<void> {
	const now = Date.now();
	await batch(db, [db.prepare('UPDATE users SET last_login_at = ?, last_activity_at = ? WHERE id = ?').bind(now, now, userId), db.prepare('UPDATE google_identities SET last_login_at = ? WHERE user_id = ?').bind(now, userId)]);
}

export async function count(db: DB): Promise<number> {
	const row = await queryOne<{ c: number }>(db, 'SELECT COUNT(*) as c FROM users', []);
	return row?.c ?? 0;
}

export async function list(db: DB, params: { page: number; limit: number }): Promise<UserRow[]> {
	const offset = (params.page - 1) * params.limit;
	return queryAll<UserRow>(db, 'SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?', [params.limit, offset]);
}
