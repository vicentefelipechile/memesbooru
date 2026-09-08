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
import { requireAuth, type AuthVariables } from '../middleware/auth';
import { AuthService } from '../../services/auth-service';
import { fail } from '../responses';
import { hashToken } from '../../helpers/crypto';
import * as sessionRepo from '../../repositories/session-repository';
import * as authRepo from '../../repositories/auth-repository';
import { TotpVerifySchema } from '../../validators';

// =========================================================================================================
// Endpoints
// =========================================================================================================

const router = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

const stateStore = new Map<string, number>();

// =========================================================================================================
// GET /api/auth/google
// Redirect to Google authorization endpoint.
// =========================================================================================================

router.get('/google', async (c) => {
	const db = c.env.DB;
	const service = new AuthService(db);
	const env = c.env;
	const state = crypto.randomUUID();

	stateStore.set(state, Date.now());
	setTimeout(() => stateStore.delete(state), 10 * 60 * 1000);

	try {
		const url = service.getGoogleAuthUrl(env, state);

		return c.redirect(url);
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);

		return fail(c, message, 500);
	}
});

// =========================================================================================================
// GET /api/auth/google/callback
// Exchange code, create/find user, set session cookie.
// =========================================================================================================

router.get('/google/callback', async (c) => {
	const code = c.req.query('code');
	const state = c.req.query('state');

	if (!code || !state || !stateStore.has(state)) return fail(c, 'Invalid state/code', 400);

	stateStore.delete(state);

	const db = c.env.DB;
	const service = new AuthService(db);
	const env = c.env;

	const tokens = await service.exchangeCodeForTokens(env, code);
	const sub = service.decodeIdTokenSub(tokens.id_token);
	const user = await service.findOrCreateUserBySub(sub);
	const sessionToken = await service.createSession(user.id);

	setCookie(c, 'session', sessionToken, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: 30 * 24 * 3600 });

	return c.redirect('/');
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

		await sessionRepo.revokeSession(db, hash);
	}

	deleteCookie(c, 'session', { path: '/' });

	return c.json({ ok: true });
});

// =========================================================================================================
// GET /api/auth/me
// Returns current user or null (optional auth).
// =========================================================================================================

router.get('/me', async (c) => {
	const token = getCookie(c, 'session');

	if (!token) return c.json({ user: null });

	const db = c.env.DB;
	const service = new AuthService(db);
	const sess = await service.verifySession(token);

	if (!sess) return c.json({ user: null });

	const row = await authRepo.findUserPublicById(db, sess.userId);

	return c.json({ user: row });
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

	await authRepo.upsertTotpSecret(db, user.id, enc);

	return c.json({ secret, uri: `otpauth://totp/Memesbooru:${user.id}?secret=${secret}&issuer=Memesbooru` });
});

// =========================================================================================================
// POST /api/auth/totp/verify
// Verify code + generate recovery codes.
// =========================================================================================================

router.post('/totp/verify', requireAuth, async (c) => {
	let body: import('../../types').JsonValue;

	try {
		body = (await c.req.json()) as import('../../types').JsonValue;
	} catch {
		return fail(c, 'Invalid JSON', 400);
	}

	const parsed = TotpVerifySchema.safeParse(body);

	if (!parsed.success) return fail(c, 'Validation error', 400, parsed.error.issues);

	const user = c.get('user');
	const db = c.env.DB;
	const service = new AuthService(db);
	const enc = await authRepo.getTotpSecret(db, user.id);

	if (!enc) return fail(c, 'no totp', 400);

	const secret = new TextDecoder().decode(enc);
	const ok = await service.totpVerify(secret, parsed.data.code);

	if (!ok) return fail(c, 'invalid code', 400);

	await authRepo.verifyTotp(db, user.id);

	const codes: string[] = [];

	for (let i = 0; i < 10; i++) {
		const rc = Math.random().toString(36).slice(2, 10).toUpperCase();
		codes.push(rc);

		const hash = await hashToken(rc);

		await authRepo.insertRecoveryCode(db, user.id, hash);
	}

	return c.json({ ok: true, recoveryCodes: codes });
});

// =========================================================================================================
// Export
// =========================================================================================================

export default router;
