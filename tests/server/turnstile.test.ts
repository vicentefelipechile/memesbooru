// =========================================================================================================
// TURNSTILE REGRESSION
// =========================================================================================================
// Verify fail-closed Siteverify, action/hostname binding and auth-route enforcement.
// =========================================================================================================

import { env } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import authRoutes from '../../src/http/routes/auth';
import { verifyTurnstile } from '../../src/helpers/turnstile';

afterEach(() => vi.unstubAllGlobals());

describe('Turnstile', () => {
	it('loads the configured public site key without returning the secret', async () => {
		const response = await authRoutes.fetch(new Request('http://localhost/turnstile'), env);
		expect(response.status).toBe(200);
		const config = await response.json();
		expect(config).toEqual({ siteKey: env.TURNSTILE_SITE_KEY });
	});

	it('rejects mismatched action, production localhost, malformed and unreachable responses', async () => {
		const request = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ success: true, hostname: 'memesbooru.cl', action: 'login' })));
		vi.stubGlobal('fetch', request);
		expect(await verifyTurnstile('secret', 'token', 'login', 'memesbooru.cl')).toBe(true);
		expect(await verifyTurnstile('secret', 'token', 'signup', 'memesbooru.cl')).toBe(false);
		request.mockImplementation(async () => new Response(JSON.stringify({ success: true, hostname: 'localhost', action: 'login' })));
		expect(await verifyTurnstile('secret', 'token', 'login', 'memesbooru.cl')).toBe(false);
		expect(await verifyTurnstile('secret', 'token', 'login', 'localhost')).toBe(true);
		request.mockImplementation(async () => new Response(JSON.stringify({ success: false, 'error-codes': ['timeout-or-duplicate'] })));
		expect(await verifyTurnstile('secret', 'token', 'login', 'localhost')).toBe(false);
		request.mockImplementation(async () => new Response('invalid'));
		expect(await verifyTurnstile('secret', 'token', 'login', 'localhost')).toBe(false);
		request.mockRejectedValue(new Error('network down'));
		expect(await verifyTurnstile('secret', 'token', 'login', 'localhost')).toBe(false);
		expect(await verifyTurnstile('secret', '', 'login', 'localhost')).toBe(false);
	});

	it('does not reach account creation or password checks without valid verification', async () => {
		const request = vi.fn().mockImplementation(async () => new Response(JSON.stringify({ success: false, hostname: 'localhost', action: 'login' })));
		vi.stubGlobal('fetch', request);
		const bindings = { TURNSTILE_SECRET_KEY: 'secret', TURNSTILE_SITE_KEY: 'site' } as Env;
		const config = await authRoutes.fetch(new Request('http://localhost/turnstile'), bindings);
		expect(await config.json()).toEqual({ siteKey: 'site' });
		const login = await authRoutes.fetch(new Request('http://localhost/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'tester', password: 'password123', turnstile_token: 'token' }) }), bindings);
		const signup = await authRoutes.fetch(new Request('http://localhost/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'tester', password: 'password123', turnstile_token: 'token' }) }), bindings);
		expect(login.status).toBe(403);
		expect(signup.status).toBe(403);
		expect(request).toHaveBeenCalledTimes(2);
		const missing = await authRoutes.fetch(new Request('http://localhost/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'tester', password: 'password123' }) }), bindings);
		expect(missing.status).toBe(400);
		expect(request).toHaveBeenCalledTimes(2);
	});
});
