// =========================================================================================================
// SESSION REPOSITORY (v2)
// =========================================================================================================
// ONLY place with SQL for sessions.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { queryOne, execute, type DB } from '../db/client';
import type { SessionRow, UserRow } from '../db/schema';

// =========================================================================================================
// Queries
// =========================================================================================================

export type SessionMeta = Pick<SessionRow, 'user_id' | 'expires_at' | 'revoked_at'>;
export type SessionWithUser = Pick<SessionRow, 'user_id' | 'expires_at' | 'revoked_at'> & Pick<UserRow, 'username' | 'rank' | 'status'>;

export async function findByTokenHash(db: DB, hash: ArrayBuffer): Promise<SessionMeta | null> {
	return queryOne<SessionMeta>(db, 'SELECT user_id, expires_at, revoked_at FROM sessions WHERE token_hash = ?', [hash]);
}

export async function findSessionWithUser(db: DB, hash: ArrayBuffer): Promise<SessionWithUser | null> {
	return queryOne<SessionWithUser>(db, 'SELECT s.user_id, s.expires_at, s.revoked_at, u.username, u.rank, u.status FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?', [hash]);
}

// =========================================================================================================
// Commands
// =========================================================================================================

export async function createSession(db: DB, userId: number, tokenHash: ArrayBuffer, expiresAt: number): Promise<void> {
	const now = Date.now();

	await execute(db, 'INSERT INTO sessions (user_id, token_hash, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)', [userId, tokenHash, now, expiresAt, now]);
}

export async function revokeSession(db: DB, hash: ArrayBuffer): Promise<void> {
	await execute(db, 'UPDATE sessions SET revoked_at = ? WHERE token_hash = ?', [Date.now(), hash]);
}

export async function cleanupExpired(db: DB): Promise<number> {
	const res = await execute(db, 'DELETE FROM sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)', [Date.now(), Date.now() - 30 * 24 * 3600 * 1000]);

	return res.meta.changes ?? 0;
}

export function buildInsertSessionStatement(db: DB, row: { userId: number; tokenHash: ArrayBuffer; createdAt: number; expiresAt: number; lastSeenAt: number }): D1PreparedStatement {
	return db.prepare('INSERT INTO sessions (user_id, token_hash, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').bind(row.userId, row.tokenHash, row.createdAt, row.expiresAt, row.lastSeenAt);
}
