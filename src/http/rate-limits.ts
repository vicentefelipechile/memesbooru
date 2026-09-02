// =========================================================================================================
// RATE LIMITS (v2)
// =========================================================================================================
// Prefer Cloudflare native RL bindings. Register global then per-route overrides.
// =========================================================================================================

import type { Hono } from 'hono';

function isLocalRequest(c: { req: { header: (name: string) => string | undefined } }): boolean {
	const host = c.req.header('host') ?? '';
	const hostname = host.split(':')[0];
	return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export function registerRateLimits(app: Hono<{ Bindings: Env }>) {
	// Global catch-all 500/60s — lowest priority, registered first
	app.use('/api/*', async (c, next) => {
		if (isLocalRequest(c as never)) return next();
		const rl = (c.env as unknown as { RL_GLOBAL?: { limit: (opts: { key: string }) => Promise<{ success: boolean }> } }).RL_GLOBAL;
		if (!rl) return next();
		const key = c.req.header('cf-connecting-ip') ?? 'unknown';
		const { success } = await rl.limit({ key: `global:${key}` });
		if (!success) return c.json({ error: 'Rate limited' }, 429);
		await next();
	});

	// Strict 1/60s for uploads
	app.use('/api/posts', async (c, next) => {
		if (c.req.method !== 'POST') return next();
		if (isLocalRequest(c as never)) return next();
		const rl = (c.env as unknown as { RL_STRICT?: { limit: (opts: { key: string }) => Promise<{ success: boolean }> } }).RL_STRICT;
		if (!rl) return next();
		const key = c.req.header('cf-connecting-ip') ?? 'unknown';
		const { success } = await rl.limit({ key: `strict:${key}` });
		if (!success) return c.json({ error: 'Rate limited - slow down' }, 429);
		await next();
	});

	// Login 10/60s
	app.use('/api/auth/*', async (c, next) => {
		if (isLocalRequest(c as never)) return next();
		const rl = (c.env as unknown as { RL_LOGIN?: { limit: (opts: { key: string }) => Promise<{ success: boolean }> } }).RL_LOGIN;
		if (!rl) return next();
		const key = c.req.header('cf-connecting-ip') ?? 'unknown';
		const { success } = await rl.limit({ key: `login:${key}` });
		if (!success) return c.json({ error: 'Too many login attempts' }, 429);
		await next();
	});
}
