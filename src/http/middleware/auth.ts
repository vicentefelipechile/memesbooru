// =========================================================================================================
// AUTH MIDDLEWARE (v2)
// =========================================================================================================
// Guards + session resolution. Routes use guards + c.get('user'). Ownership checks belong in service.
// =========================================================================================================

import type { Context, Next } from 'hono';
import { getCookie } from 'hono/cookie';
import { UnauthorizedError, ForbiddenError } from '../../domain/errors';
import type { AuthUser, UserRank, UserStatus } from '../../types';
import { hashToken } from '../../helpers/crypto';
import * as sessionRepo from '../../repositories/session-repository';

export type AuthVariables = { user: AuthUser };

async function getAuthUser(c: Context<{ Bindings: Env; Variables: AuthVariables }>): Promise<AuthUser | null> {
	const token = getCookie(c, 'session');
	if (!token) return null;
	const db = c.env.DB;
	const hash = await hashToken(token);
	const row = await sessionRepo.findSessionWithUser(db, hash);
	if (!row || row.revoked_at || row.expires_at < Date.now()) return null;
	return {
		id: row.user_id,
		username: row.username,
		rank: row.rank as UserRank,
		status: row.status as UserStatus,
		isAdmin: row.rank === 'trusted',
	};
}

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

export { getAuthUser };
