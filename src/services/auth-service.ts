// =========================================================================================================
// AUTH SERVICE (v2)
// =========================================================================================================
// Business rules for Google OAuth + sessions + TOTP. No Hono/c.env. Throw DomainError.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { z } from 'zod';
import type { DB } from '../db/client';
import { UserRepository } from '../repositories/user-repository';
import { AuthRepository } from '../repositories/auth-repository';
import { SessionRepository } from '../repositories/session-repository';
import { normalizeTag } from '../validators';
import { ConflictError, UnauthorizedError, ValidationError } from '../domain/errors';
import { b64url, encodePassword, hashToken, verifyPassword } from '../helpers/crypto';
import { totpVerifyCode, generateTotpSecretValue } from './auth-totp';
import { PermissionService } from './permission-service';
import type { AuthUserBrief, GoogleTokens, SessionTokenPair } from '../types';
import type { UserRow } from '../db/schema';
import { toUserId } from '../types';

// =========================================================================================================
// Types
// =========================================================================================================

export type GoogleEnv = { GOOGLE_CLIENT_ID: string; GOOGLE_CLIENT_SECRET: string; GOOGLE_REDIRECT_URI: string };

const GoogleUserInfoSchema = z.object({ sub: z.string().min(1), email: z.email().max(254) });

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
	private readonly sessions: SessionRepository;
	private readonly users: UserRepository;

	constructor(private readonly db: DB) {
		this.sessions = new SessionRepository(db);
		this.users = new UserRepository(db);
	}

	getGoogleAuthUrl(env: GoogleEnv, state: string): string {
		if (!env.GOOGLE_CLIENT_ID) throw new Error('Google not configured');

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
		if (res.status >= 500) throw new Error(`Google token exchange failed: ${res.status}`);
		if (!res.ok) throw new ValidationError('Invalid Google authorization code');

		const data = await res.json();

		if (typeof data !== 'object' || data === null || !('id_token' in data) || !('access_token' in data)) {
			throw new Error('Invalid Google token response');
		}

		if (typeof data.id_token !== 'string' || typeof data.access_token !== 'string') {
			throw new Error('Invalid Google token response');
		}

		return { id_token: data.id_token, access_token: data.access_token };
	}

	async getGoogleUserInfo(accessToken: string): Promise<z.infer<typeof GoogleUserInfoSchema>> {
		const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { authorization: `Bearer ${accessToken}` } });
		if (!response.ok) throw new Error(`Google user info failed: ${response.status}`);

		const parsed = GoogleUserInfoSchema.safeParse(await response.json());
		if (!parsed.success) throw new Error('Invalid Google user info');

		return parsed.data;
	}

	generateUsernameFromSub(sub: string): string {
		const base = `user_${sub.slice(-8)}`;

		return normalizeTag(base).slice(0, 20) || `user_${Date.now().toString(36)}`;
	}

	async findOrCreateUserBySub(sub: string, email: string): Promise<AuthUserBrief> {
		const user = await this.users.findByGoogleSubject(sub);

		if (user) {
			await this.users.updateLastLogin(user.id, email);

			return this.toBrief(user);
		}

		let username = this.generateUsernameFromSub(sub);

		for (let i = 0; i < 5; i++) {
			const exists = await this.users.findByUsername(username);

			if (!exists) break;

			username = `${username}_${Math.random().toString(36).slice(2, 4)}`;
		}

		const created = await this.users.createFromGoogle(sub, username, email);

		return this.toBrief(created);
	}

	async createSession(userId: number): Promise<string> {
		const { token, hash } = await generateSessionToken();
		const expiresAt = Date.now() + 30 * 24 * 3600 * 1000;

		await this.sessions.createSession(userId, hash, expiresAt);

		return token;
	}

	async authenticatePassword(username: string, password: string): Promise<AuthUserBrief> {
		const user = await this.users.findByUsername(username);
		if (!user?.password_hash || user.status === 'banned' || !(await verifyPassword(password, user.password_hash))) throw new UnauthorizedError('Credenciales invalidas');

		return this.toBrief(user);
	}

	async register(username: string, password: string): Promise<AuthUserBrief> {
		if (await this.users.findByUsername(username)) throw new ConflictError('username already in use');
		const user = await this.users.createLocal(username, await encodePassword(password));
		return this.toBrief(user);
	}

	private async toBrief(user: UserRow): Promise<AuthUserBrief> {
		const permissions = new PermissionService(this.db);
		return { id: user.id, username: user.username, roles: (await permissions.userRolesForLogin(user.id)).map((role) => role.name), permissions: await permissions.forUser(toUserId(user.id)) };
	}

	async setPassword(userId: number, password: string): Promise<void> {
		await new AuthRepository(this.db).setPassword(userId, await encodePassword(password));
	}

	async verifyCurrentPassword(userId: number, password: string): Promise<boolean> {
		const user = await new AuthRepository(this.db).findUserById(userId);
		return user?.password_hash ? verifyPassword(password, user.password_hash) : false;
	}

	async changePassword(userId: number, currentPassword: string, password: string): Promise<void> {
		if (!(await this.verifyCurrentPassword(userId, currentPassword))) throw new UnauthorizedError('Credenciales invalidas');

		await this.setPassword(userId, password);
	}

	async verifyTotpSetup(userId: number, code: string): Promise<void> {
		const auth = new AuthRepository(this.db);
		const encrypted = await auth.getTotpSecret(userId);
		if (!encrypted) throw new ValidationError('no totp');

		const secret = new TextDecoder().decode(encrypted);
		if (!(await this.totpVerify(secret, code))) throw new ValidationError('invalid code');

		await auth.verifyTotp(userId);
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
