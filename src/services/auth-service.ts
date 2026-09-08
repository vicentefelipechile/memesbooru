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

// =========================================================================================================
// Types
// =========================================================================================================

export type GoogleEnv = { GOOGLE_CLIENT_ID: string; GOOGLE_CLIENT_SECRET: string; GOOGLE_REDIRECT_URI: string };

// =========================================================================================================
// Helpers
// =========================================================================================================

export async function generateSessionToken(): Promise<{ token: string; hash: ArrayBuffer }> {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	const token = b64url(bytes);
	const hash = await hashToken(token);

	return { token, hash };
}

export const hashTokenSync = hashToken;

function base32Decode(s: string): Uint8Array {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
	s = s.replace(/=+$/, '').toUpperCase();

	let bits = 0;
	let value = 0;
	const out: number[] = [];

	for (const c of s) {
		const idx = alphabet.indexOf(c);

		if (idx === -1) throw new ValidationError('invalid base32');

		value = (value << 5) | idx;
		bits += 5;

		if (bits >= 8) {
			out.push((value >>> (bits - 8)) & 0xff);
			bits -= 8;
		}
	}

	return new Uint8Array(out);
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

	async exchangeCodeForTokens(env: GoogleEnv, code: string): Promise<{ id_token: string; access_token: string }> {
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

	async findOrCreateUserBySub(sub: string): Promise<{ id: number; username: string; rank: string }> {
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

	async verifySession(token: string): Promise<{ userId: number } | null> {
		const hash = await hashToken(token);
		const row = await sessionRepo.findByTokenHash(this.db, hash);

		if (!row || row.revoked_at) return null;

		if (row.expires_at < Date.now()) return null;

		return { userId: row.user_id };
	}

	async totpVerify(secretBase32: string, token: string, window = 1): Promise<boolean> {
		const raw = base32Decode(secretBase32);
		const key = new Uint8Array(raw.length);
		key.set(raw);

		const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);

		const step = 30;
		const now = Math.floor(Date.now() / 1000 / step);

		for (let i = -window; i <= window; i++) {
			const counter = now + i;
			const buf = new ArrayBuffer(8);
			new DataView(buf).setBigUint64(0, BigInt(counter), false);

			const sig = await crypto.subtle.sign('HMAC', cryptoKey, buf);
			const offset = new Uint8Array(sig)[19] & 0xf;
			const code = ((new DataView(sig).getUint32(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');

			if (code === token) return true;
		}

		return false;
	}

	generateTotpSecret(): string {
		const bytes = crypto.getRandomValues(new Uint8Array(20));
		const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

		let out = '';
		let bits = 0;
		let value = 0;

		for (const b of bytes) {
			value = (value << 8) | b;
			bits += 8;

			while (bits >= 5) {
				out += alphabet[(value >>> (bits - 5)) & 31];
				bits -= 5;
			}
		}

		if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];

		while (out.length % 8 !== 0) out += '=';

		return out;
	}
}
