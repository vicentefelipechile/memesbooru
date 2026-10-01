// =========================================================================================================
// AUTH ROUTES (v2)
// =========================================================================================================
// Google OAuth manual + session + TOTP. Thin handlers — logic in AuthService.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { z } from 'zod';
import { getAuthUser, requireAuth, type AuthVariables } from '../middleware/auth';
import { AuthService } from '../../services/auth-service';
import { fail } from '../responses';
import { hashToken } from '../../helpers/crypto';
import { SessionRepository } from '../../repositories/session-repository';
import { AuthRepository } from '../../repositories/auth-repository';
import { PasswordChangeSchema, PasswordLoginSchema, RegisterSchema, TotpVerifySchema } from '../../validators';
import type { JsonValue } from '../../types';
import { isAllowedOrigin } from '../../helpers/net';
import { verifyTurnstile } from '../../helpers/turnstile';
import { PermissionService } from '../../services/permission-service';

// =========================================================================================================
// Endpoints
// =========================================================================================================

const router = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

type OAuthState = { returnTo: string };

const stateStore = new Map<string, OAuthState>();

router.get('/turnstile', (c) => {
	if (!c.env.TURNSTILE_SITE_KEY || !c.env.TURNSTILE_SECRET_KEY) return fail(c, 'Turnstile not configured', 503);

	return c.json({ siteKey: c.env.TURNSTILE_SITE_KEY });
});

router.post('/login', async (c) => {
	const body = await c.req.json<JsonValue>().catch(() => null);
	const parsed = PasswordLoginSchema.safeParse(body);

	if (!parsed.success) return fail(c, 'Validation error', 400, parsed.error.issues);
	if (!(await verifyTurnstile(c.env.TURNSTILE_SECRET_KEY, parsed.data.turnstile_token, 'login', new URL(c.req.url).hostname, c.req.header('origin'), c.req.header('cf-connecting-ip')))) return fail(c, 'Verification failed', 403);

	const service = new AuthService(c.env.DB);
	const user = await service.authenticatePassword(parsed.data.username, parsed.data.password);

	const token = await service.createSession(user.id);
	setCookie(c, 'session', token, { httpOnly: true, secure: true, sameSite: 'None', path: '/', maxAge: 30 * 24 * 3600 });

	return c.json({ user });
});

router.post('/register', async (c) => {
	const body = await c.req.json<JsonValue>().catch(() => null);
	const parsed = RegisterSchema.safeParse(body);
	if (!parsed.success) return fail(c, 'Validation error', 400, parsed.error.issues);
	if (!(await verifyTurnstile(c.env.TURNSTILE_SECRET_KEY, parsed.data.turnstile_token, 'signup', new URL(c.req.url).hostname, c.req.header('origin'), c.req.header('cf-connecting-ip')))) return fail(c, 'Verification failed', 403);
	const service = new AuthService(c.env.DB);
	const user = await service.register(parsed.data.username, parsed.data.password);
	setCookie(c, 'session', await service.createSession(user.id), { httpOnly: true, secure: true, sameSite: 'None', path: '/', maxAge: 30 * 24 * 3600 });
	return c.json({ user }, 201);
});

router.post('/password', requireAuth, async (c) => {
	const body = await c.req.json<JsonValue>().catch(() => null);
	const parsed = PasswordChangeSchema.safeParse(body);

	if (!parsed.success) return fail(c, 'Validation error', 400, parsed.error.issues);

	const user = c.get('user');
	const service = new AuthService(c.env.DB);
	await service.changePassword(user.id, parsed.data.current_password, parsed.data.password);

	return c.json({ ok: true });
});

// =========================================================================================================
// GET /api/auth/google
// Redirect to Google authorization endpoint.
// =========================================================================================================

router.get('/google', async (c) => {
	const db = c.env.DB;
	const service = new AuthService(db);
	const env = c.env;
	const state = crypto.randomUUID();
	const requestedReturnTo = c.req.query('returnTo');
	const requestOrigin = new URL(c.req.url).origin;

	if (requestedReturnTo && !isAllowedOrigin(requestedReturnTo)) return fail(c, 'Invalid return URL', 400);

	const returnTo = requestedReturnTo ?? (isAllowedOrigin(requestOrigin) ? requestOrigin : '/');

	stateStore.set(state, { returnTo });
	setTimeout(() => stateStore.delete(state), 10 * 60 * 1000);

	const url = service.getGoogleAuthUrl(env, state);

	return c.redirect(url);
});

// =========================================================================================================
// GET /api/auth/google/callback
// Exchange code, create/find user, set session cookie.
// =========================================================================================================

router.get('/google/callback', async (c) => {
	const code = c.req.query('code');
	const state = c.req.query('state');

	if (!code || !state) return fail(c, 'Invalid state/code', 400);

	const oauthState = stateStore.get(state);

	if (!oauthState) return fail(c, 'Invalid state/code', 400);

	stateStore.delete(state);

	const db = c.env.DB;
	const service = new AuthService(db);
	const env = c.env;

	const tokens = await service.exchangeCodeForTokens(env, code);
	const { sub, email } = await service.getGoogleUserInfo(tokens.access_token);
	const user = await service.findOrCreateUserBySub(sub, email);
	const sessionToken = await service.createSession(user.id);

	setCookie(c, 'session', sessionToken, { httpOnly: true, secure: true, sameSite: 'None', path: '/', maxAge: 30 * 24 * 3600 });

	return c.redirect(oauthState.returnTo === '/' ? '/' : `${oauthState.returnTo}/`);
});

// =========================================================================================================
// POST /api/auth/logout
// Revoke session.
// =========================================================================================================

router.post('/logout', async (c) => {
	const token = getCookie(c, 'session');

	if (token) {
		const db = c.env.DB;
		const hash = await hashToken(token);

		await new SessionRepository(db).revokeSession(hash);
	}

	deleteCookie(c, 'session', { path: '/' });

	return c.json({ ok: true });
});

// =========================================================================================================
// GET /api/auth/me
// Returns current user or null (optional auth).
// =========================================================================================================

router.get('/me', async (c) => {
	const user = await getAuthUser(c);
	if (!user) return c.json({ user: null });
	const db = c.env.DB;
	const row = await new AuthRepository(db).findUserPublicById(user.id);

	if (!row) return c.json({ user: null });
	const permissions = new PermissionService(db);
	return c.json({ user: { ...row, roles: (await permissions.userRolesForLogin(user.id)).map((role) => role.name), permissions: user.permissions } });
});

// =========================================================================================================
// POST /api/auth/totp/setup
// Generate TOTP secret (requireAuth).
// =========================================================================================================

router.post('/totp/setup', requireAuth, async (c) => {
	const user = c.get('user');
	const db = c.env.DB;
	const service = new AuthService(db);
	const secret = service.generateTotpSecret();
	const enc = new TextEncoder().encode(secret);

	await new AuthRepository(db).upsertTotpSecret(user.id, enc);

	return c.json({ secret, uri: `otpauth://totp/Memesbooru:${user.id}?secret=${secret}&issuer=Memesbooru` });
});

// =========================================================================================================
// POST /api/auth/totp/verify
// Verify code + generate recovery codes.
// =========================================================================================================

router.post('/totp/verify', requireAuth, async (c) => {
	let body: JsonValue;

	try {
		body = (await c.req.json()) as JsonValue;
	} catch {
		return fail(c, 'Invalid JSON', 400);
	}

	const parsed = TotpVerifySchema.safeParse(body);

	if (!parsed.success) return fail(c, 'Validation error', 400, parsed.error.issues);

	const user = c.get('user');
	const db = c.env.DB;
	const service = new AuthService(db);
	await service.verifyTotpSetup(user.id, parsed.data.code);

	const codes: string[] = [];

	for (let i = 0; i < 10; i++) {
		const rc = Math.random().toString(36).slice(2, 10).toUpperCase();
		codes.push(rc);

		const hash = await hashToken(rc);

		await new AuthRepository(db).insertRecoveryCode(user.id, hash);
	}

	return c.json({ ok: true, recoveryCodes: codes });
});

// =========================================================================================================
// Export
// =========================================================================================================

export default router;
