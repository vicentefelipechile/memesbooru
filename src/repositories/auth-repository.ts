// =========================================================================================================
// AUTH REPOSITORY (v2)
// =========================================================================================================
// ONLY place with SQL for users/TOTP/recovery codes.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { queryOne, execute, type DB } from '../db/client';
import type { UserRow, UserTotpRow } from '../db/schema';

// =========================================================================================================
// Types
// =========================================================================================================

export type UserPublic = Pick<UserRow, 'id' | 'username' | 'display_name' | 'rank' | 'status'>;

// =========================================================================================================
// Queries
// =========================================================================================================

export class AuthRepository {
	constructor(private readonly db: DB) {}

	async findUserById(id: number): Promise<UserRow | null> {
		return queryOne<UserRow>(this.db, 'SELECT * FROM users WHERE id = ?', [id]);
	}

	async findUserPublicById(id: number): Promise<UserPublic | null> {
		return queryOne<UserPublic>(this.db, 'SELECT id, username, display_name, rank, status FROM users WHERE id = ?', [id]);
	}

	async findUserByEmail(email: string): Promise<UserRow | null> {
		return queryOne<UserRow>(this.db, 'SELECT * FROM users WHERE email = ?', [email]);
	}

	async setPassword(userId: number, passwordHash: ArrayBuffer): Promise<void> {
		await execute(this.db, 'UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, userId]);
	}

	async setEmail(userId: number, email: string): Promise<void> {
		await execute(this.db, 'UPDATE users SET email = ?, email_verified_at = NULL WHERE id = ?', [email, userId]);
	}

	async setDisplayName(userId: number, displayName: string | null): Promise<void> {
		await execute(this.db, 'UPDATE users SET display_name = ? WHERE id = ?', [displayName, userId]);
	}

	async getTotpSecret(userId: number): Promise<Uint8Array | null> {
		const row = await queryOne<Pick<UserTotpRow, 'secret_encrypted'>>(this.db, 'SELECT secret_encrypted FROM user_totp WHERE user_id = ?', [userId]);
		return row?.secret_encrypted ?? null;
	}

	// =========================================================================================================
	// Commands
	// =========================================================================================================

	async upsertTotpSecret(userId: number, secretEncrypted: Uint8Array): Promise<void> {
		await execute(this.db, 'INSERT OR REPLACE INTO user_totp (user_id, secret_encrypted, is_verified, created_at) VALUES (?, ?, 0, ?)', [userId, secretEncrypted, Date.now()]);
	}

	async verifyTotp(userId: number): Promise<void> {
		await execute(this.db, 'UPDATE user_totp SET is_verified = 1, verified_at = ? WHERE user_id = ?', [Date.now(), userId]);
	}

	async insertRecoveryCode(userId: number, codeHash: ArrayBuffer): Promise<void> {
		await execute(this.db, 'INSERT INTO totp_recovery_codes (user_id, code_hash, created_at) VALUES (?, ?, ?)', [userId, codeHash, Date.now()]);
	}
}
