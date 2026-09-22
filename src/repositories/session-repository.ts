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
// Types
// =========================================================================================================

export type SessionMeta = Pick<SessionRow, 'user_id' | 'expires_at' | 'revoked_at'>;
export type SessionWithUser = Pick<SessionRow, 'user_id' | 'expires_at' | 'revoked_at'> & Pick<UserRow, 'username' | 'rank' | 'status'>;

export type InsertSessionStatementData = {
	userId: SessionRow['user_id'];
	tokenHash: SessionRow['token_hash'];
	createdAt: SessionRow['created_at'];
	expiresAt: SessionRow['expires_at'];
	lastSeenAt: SessionRow['last_seen_at'];
};

// =========================================================================================================
// Queries
// =========================================================================================================

export class SessionRepository {
	constructor(private readonly db: DB) {}

	async findByTokenHash(hash: ArrayBuffer): Promise<SessionMeta | null> {
		return queryOne<SessionMeta>(this.db, 'SELECT user_id, expires_at, revoked_at FROM sessions WHERE token_hash = ?', [hash]);
	}

	async findSessionWithUser(hash: ArrayBuffer): Promise<SessionWithUser | null> {
		return queryOne<SessionWithUser>(this.db, 'SELECT s.user_id, s.expires_at, s.revoked_at, u.username, u.rank, u.status FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?', [hash]);
	}

	// =========================================================================================================
	// Builders
	// =========================================================================================================

	buildInsertSessionStatement(row: InsertSessionStatementData): D1PreparedStatement {
		return this.db.prepare('INSERT INTO sessions (user_id, token_hash, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').bind(row.userId, row.tokenHash, row.createdAt, row.expiresAt, row.lastSeenAt);
	}

	// =========================================================================================================
	// Commands
	// =========================================================================================================

	async createSession(userId: number, tokenHash: ArrayBuffer, expiresAt: number): Promise<void> {
		const now = Date.now();

		await execute(this.db, 'INSERT INTO sessions (user_id, token_hash, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)', [userId, tokenHash, now, expiresAt, now]);
	}

	async revokeSession(hash: ArrayBuffer): Promise<void> {
		await execute(this.db, 'UPDATE sessions SET revoked_at = ? WHERE token_hash = ?', [Date.now(), hash]);
	}

	async cleanupExpired(): Promise<number> {
		const res = await execute(this.db, 'DELETE FROM sessions WHERE expires_at < ? OR (revoked_at IS NOT NULL AND revoked_at < ?)', [Date.now(), Date.now() - 30 * 24 * 3600 * 1000]);

		return res.meta.changes ?? 0;
	}
}
