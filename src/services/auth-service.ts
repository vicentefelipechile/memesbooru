// =========================================================================================================
// AUTH SERVICE (v2)
// =========================================================================================================
// Business rules for Google OAuth + sessions + TOTP. No Hono/c.env. Throw DomainError.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import type { DB } from '../db/client';
import * as userRepo from '../repositories/user-repository';
import * as sessionRepo from '../repositories/session-repository';
import { normalizeTag } from '../validators';
import { ValidationError } from '../domain/errors';
import { b64url, hashToken } from '../helpers/crypto';
import { totpVerifyCode, generateTotpSecretValue } from './auth-totp';
import type { AuthUserBrief, GoogleTokens, SessionTokenPair, SessionVerification } from '../types';

// =========================================================================================================
// Types
// =========================================================================================================

export type GoogleEnv = { GOOGLE_CLIENT_ID: string; GOOGLE_CLIENT_SECRET: string; GOOGLE_REDIRECT_URI: string };

// =========================================================================================================
// Helpers
// =========================================================================================================

export async function generateSessionToken(): Promise<SessionTokenPair> {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	const token = b64url(bytes);
	const hash = await hashToken(token);

	return { token, hash };
}

// =========================================================================================================
// Service
// =========================================================================================================

export class AuthService {
	constructor(private readonly db: DB) {}

	getGoogleAuthUrl(env: GoogleEnv, state: string): string {
		if (!env.GOOGLE_CLIENT_ID) throw new ValidationError('Google not configured');

		const p = new URLSearchParams({
			client_id: env.GOOGLE_CLIENT_ID,
			redirect_uri: env.GOOGLE_REDIRECT_URI,
			response_type: 'code',
			scope: 'openid email profile',
			state,
			access_type: 'offline',
			prompt: 'consent',
		});

		return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
	}

	async exchangeCodeForTokens(env: GoogleEnv, code: string): Promise<GoogleTokens> {
		const res = await fetch('https://oauth2.googleapis.com/token', {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				code,
				client_id: env.GOOGLE_CLIENT_ID,
				client_secret: env.GOOGLE_CLIENT_SECRET,
				redirect_uri: env.GOOGLE_REDIRECT_URI,
				grant_type: 'authorization_code',
			}),
		});
		if (!res.ok) throw new ValidationError(`google token exchange failed: ${res.status}`);

		const data = await res.json();

		if (typeof data !== 'object' || data === null || !('id_token' in data) || !('access_token' in data)) {
			throw new ValidationError('invalid token response');
		}

		if (typeof data.id_token !== 'string' || typeof data.access_token !== 'string') {
			throw new ValidationError('invalid token response');
		}

		return { id_token: data.id_token, access_token: data.access_token };
	}

	decodeIdTokenSub(idToken: string): string {
		const parts = idToken.split('.');

		if (parts.length !== 3) throw new ValidationError('invalid id_token');

		const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));

		if (!payload.sub) throw new ValidationError('id_token without sub');

		if (typeof payload.sub !== 'string') throw new ValidationError('id_token without sub');

		return payload.sub;
	}

	generateUsernameFromSub(sub: string): string {
		const base = `user_${sub.slice(-8)}`;

		return normalizeTag(base).slice(0, 20) || `user_${Date.now().toString(36)}`;
	}

	async findOrCreateUserBySub(sub: string): Promise<AuthUserBrief> {
		const user = await userRepo.findByGoogleSubject(this.db, sub);

		if (user) {
			await userRepo.updateLastLogin(this.db, user.id);

			return { id: user.id, username: user.username, rank: user.rank };
		}

		let username = this.generateUsernameFromSub(sub);

		for (let i = 0; i < 5; i++) {
			const exists = await userRepo.findByUsername(this.db, username);

			if (!exists) break;

			username = `${username}_${Math.random().toString(36).slice(2, 4)}`;
		}

		const created = await userRepo.createFromGoogle(this.db, sub, username);

		return { id: created.id, username: created.username, rank: created.rank };
	}

	async createSession(userId: number): Promise<string> {
		const { token, hash } = await generateSessionToken();
		const expiresAt = Date.now() + 30 * 24 * 3600 * 1000;

		await sessionRepo.createSession(this.db, userId, hash, expiresAt);

		return token;
	}

	async verifySession(token: string): Promise<SessionVerification | null> {
		const hash = await hashToken(token);
		const row = await sessionRepo.findByTokenHash(this.db, hash);

		if (!row || row.revoked_at) return null;

		if (row.expires_at < Date.now()) return null;

		return { userId: row.user_id };
	}

	async totpVerify(secretBase32: string, token: string, window = 1): Promise<boolean> {
		return totpVerifyCode(secretBase32, token, window);
	}

	generateTotpSecret(): string {
		return generateTotpSecretValue();
	}
}

// =========================================================================================================
// Export (backwards compat alias — use hashToken)
// =========================================================================================================

export const hashTokenSync = hashToken;
