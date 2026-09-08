// =========================================================================================================
// AUTH MIDDLEWARE (v2)
// =========================================================================================================
// Guards + session resolution. Routes use guards + c.get('user'). Ownership checks belong in service.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { UnauthorizedError, ForbiddenError } from '../../domain/errors';
import { hashToken } from '../../helpers/crypto';
import * as sessionRepo from '../../repositories/session-repository';
import type { AuthUser, UserRank, UserStatus } from '../../types';
import { toUserId } from '../../types';
import { USER_RANKS } from '../../validators';

// =========================================================================================================
// Types
// =========================================================================================================

export type AuthVariables = { user: AuthUser };

// =========================================================================================================
// Consts
// =========================================================================================================

const USER_STATUSES = ['active', 'restricted', 'banned'] as const;

// =========================================================================================================
// Helpers
// =========================================================================================================

function toUserRank(value: string): UserRank | null {
	return (USER_RANKS as readonly string[]).includes(value) ? (value as UserRank) : null;
}

function toUserStatus(value: string): UserStatus | null {
	return (USER_STATUSES as readonly string[]).includes(value) ? (value as UserStatus) : null;
}

export async function getAuthUser(c: Context<{ Bindings: Env; Variables: AuthVariables }>): Promise<AuthUser | null> {
	const token = getCookie(c, 'session');

	if (!token) return null;

	const db = c.env.DB;
	const hash = await hashToken(token);
	const row = await sessionRepo.findSessionWithUser(db, hash);

	if (!row || row.revoked_at || row.expires_at < Date.now()) return null;

	const rank = toUserRank(row.rank);
	const status = toUserStatus(row.status);

	if (!rank || !status) return null;

	return {
		id: toUserId(row.user_id),
		username: row.username,
		rank,
		status,
		isAdmin: rank === 'trusted',
	};
}

// =========================================================================================================
// Guards
// =========================================================================================================

export async function requireAuth(c: Context<{ Bindings: Env; Variables: AuthVariables }>, next: Next) {
	const user = await getAuthUser(c);

	if (!user) throw new UnauthorizedError();

	c.set('user', user);

	await next();
}

export async function requireAdmin(c: Context<{ Bindings: Env; Variables: AuthVariables }>, next: Next) {
	const user = await getAuthUser(c);

	if (!user) throw new UnauthorizedError();

	if (!user.isAdmin) throw new ForbiddenError();

	c.set('user', user);

	await next();
}

export async function optionalAuth(c: Context<{ Bindings: Env; Variables: AuthVariables }>, next: Next) {
	const user = await getAuthUser(c);

	if (user) c.set('user', user);

	await next();
}
