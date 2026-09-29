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
import { UnauthorizedError } from '../../domain/errors';
import { hashToken } from '../../helpers/crypto';
import { SessionRepository } from '../../repositories/session-repository';
import { PermissionService } from '../../services/permission-service';
import type { AuthUser, UserStatus } from '../../types';
import { toUserId } from '../../types';

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

function toUserStatus(value: string): UserStatus | null {
	return (USER_STATUSES as readonly string[]).includes(value) ? (value as UserStatus) : null;
}

export async function getAuthUser(c: Context<{ Bindings: Env; Variables: AuthVariables }>): Promise<AuthUser | null> {
	const token = getCookie(c, 'session');

	if (!token) return null;

	const db = c.env.DB;
	const hash = await hashToken(token);
	const row = await new SessionRepository(db).findSessionWithUser(hash);

	if (!row || row.revoked_at || row.expires_at < Date.now()) return null;

	const status = toUserStatus(row.status);

	if (!status || status === 'banned') return null;
	const id = toUserId(row.user_id);

	return {
		id,
		username: row.username,
		status,
		permissions: await new PermissionService(db).forUser(id),
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

export async function optionalAuth(c: Context<{ Bindings: Env; Variables: AuthVariables }>, next: Next) {
	const user = await getAuthUser(c);

	if (user) c.set('user', user);

	await next();
}
