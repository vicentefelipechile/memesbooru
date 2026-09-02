// =========================================================================================================
// AUTH REPOSITORY (v2)
// =========================================================================================================
// ONLY place with SQL for users/TOTP/recovery codes.
// =========================================================================================================

import { queryOne, type DB } from '../db/client';
import type { UserRow } from '../db/schema';

export async function findUserById(db: DB, id: number): Promise<UserRow | null> {
	return queryOne<UserRow>(db, 'SELECT * FROM users WHERE id = ?', [id]);
}

export type UserPublic = Pick<UserRow, 'id' | 'username' | 'display_name' | 'rank' | 'status'>;

export async function findUserPublicById(db: DB, id: number): Promise<UserPublic | null> {
	return queryOne<UserPublic>(db, 'SELECT id, username, display_name, rank, status FROM users WHERE id = ?', [id]);
}

export async function upsertTotpSecret(db: DB, userId: number, secretEncrypted: Uint8Array): Promise<void> {
	await queryOne(db, 'INSERT OR REPLACE INTO user_totp (user_id, secret_encrypted, is_verified, created_at) VALUES (?, ?, 0, ?)', [userId, secretEncrypted, Date.now()]);
}

export async function getTotpSecret(db: DB, userId: number): Promise<Uint8Array | null> {
	const row = await queryOne<{ secret_encrypted: Uint8Array }>(db, 'SELECT secret_encrypted FROM user_totp WHERE user_id = ?', [userId]);
	return row?.secret_encrypted ?? null;
}

export async function verifyTotp(db: DB, userId: number): Promise<void> {
	await queryOne(db, 'UPDATE user_totp SET is_verified = 1, verified_at = ? WHERE user_id = ?', [Date.now(), userId]);
}

export async function insertRecoveryCode(db: DB, userId: number, codeHash: ArrayBuffer): Promise<void> {
	await queryOne(db, 'INSERT INTO totp_recovery_codes (user_id, code_hash, created_at) VALUES (?, ?, ?)', [userId, codeHash, Date.now()]);
}
