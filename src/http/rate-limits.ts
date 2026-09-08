// =========================================================================================================
// RATE LIMITS (v2)
// =========================================================================================================
// Prefer Cloudflare native RL bindings. Register global then per-route overrides.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import type { Hono } from 'hono';
import type { BareHeaderReader } from '../helpers/net';

// =========================================================================================================
// Helpers
// =========================================================================================================

function isLocalRequest(c: BareHeaderReader): boolean {
	const host = c.req.header('host') ?? '';
	const hostname = host.split(':')[0];
	return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

// =========================================================================================================
// Middleware
// =========================================================================================================

export function registerRateLimits(app: Hono<{ Bindings: Env }>) {
	// Docs verificadas 2026-09-02: https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/
	// ratelimits[].name -> env.NAME.limit({ key }) — que falle si no existe, sin if (!rl)
	app.use('/api/*', async (c, next) => {
		if (isLocalRequest(c)) return next();
		const key = c.req.header('cf-connecting-ip') ?? 'unknown';
		const { success } = await c.env.RL_GLOBAL.limit({ key: `global:${key}` });
		if (!success) return c.json({ error: 'Rate limited' }, 429);
		await next();
	});

	app.use('/api/posts', async (c, next) => {
		if (c.req.method !== 'POST') return next();
		if (isLocalRequest(c)) return next();
		const key = c.req.header('cf-connecting-ip') ?? 'unknown';
		const { success } = await c.env.RL_STRICT.limit({ key: `strict:${key}` });
		if (!success) return c.json({ error: 'Rate limited - slow down' }, 429);
		await next();
	});

	app.use('/api/auth/*', async (c, next) => {
		if (isLocalRequest(c)) return next();
		const key = c.req.header('cf-connecting-ip') ?? 'unknown';
		const { success } = await c.env.RL_LOGIN.limit({ key: `login:${key}` });
		if (!success) return c.json({ error: 'Too many login attempts' }, 429);
		await next();
	});
}
