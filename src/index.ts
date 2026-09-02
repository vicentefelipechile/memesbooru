// =========================================================================================================
// COMPOSITION ROOT (v2)
// =========================================================================================================
// Zero business logic, zero SQL. Registers middleware, mounts routers, central error handling.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { Hono } from 'hono';
import { z } from 'zod';
import { securityMiddleware } from './http/middleware/security';
import { registerRateLimits } from './http/rate-limits';
import { DomainError } from './domain/errors';
import healthRoutes from './http/routes/health';
import authRoutes from './http/routes/auth';
import postRoutes from './http/routes/posts';
import tagRoutes from './http/routes/tags';
import commentRoutes from './http/routes/comments';
import interactionRoutes from './http/routes/interactions';
import moderationRoutes from './http/routes/moderation';
import { handleQueue } from './queues/processor';

// =========================================================================================================
// App
// =========================================================================================================

const app = new Hono<{ Bindings: Env }>();

securityMiddleware(app);
registerRateLimits(app);

app.onError((err, c) => {
	if (err instanceof DomainError) {
		return c.json(err.details === undefined ? { error: err.message } : { error: err.message, details: err.details }, err.status as 400);
	}
	if (err instanceof z.ZodError) {
		return c.json({ error: 'Validation error', details: err.issues }, 400);
	}
	console.error('Unhandled error:', err instanceof Error ? (err.stack ?? err.message) : String(err));
	return c.json({ error: 'Internal Server Error' }, 500);
});

// =========================================================================================================
// Routes
// =========================================================================================================

app.route('/api/health', healthRoutes);
app.route('/api/auth', authRoutes);
app.route('/api/posts', postRoutes);
app.route('/api/tags', tagRoutes);
app.route('/api/comments', commentRoutes);
app.route('/api', interactionRoutes);
app.route('/api/moderation', moderationRoutes);

// =========================================================================================================
// 404
// =========================================================================================================

app.notFound((c) => {
	if (c.req.path.startsWith('/api/')) return c.json({ error: 'Not found', path: c.req.path }, 404);
	return c.text('Not found', 404);
});

// =========================================================================================================
// Export (fetch + queue + scheduled)
// =========================================================================================================

export default {
	fetch: app.fetch,
	async queue(batch: MessageBatch<unknown>, env: Env) {
		await handleQueue(batch, env as unknown as Env & { DB: D1Database; MEDIA_BUCKET: R2Bucket; QUARANTINE_BUCKET: R2Bucket });
	},
	async scheduled(event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
		const db = (env as unknown as { DB: D1Database }).DB;
		if (!db) return;
		await db.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()).run();
		const recent = await db
			.prepare('SELECT DISTINCT post_id FROM post_ratings WHERE updated_at > ? LIMIT 100')
			.bind(Date.now() - 3600_000)
			.all<{ post_id: number }>();
		for (const r of recent.results ?? []) {
			const vals = await db.prepare('SELECT value FROM post_ratings WHERE post_id = ?').bind(r.post_id).all<{ value: number }>();
			const score = (vals.results ?? []).reduce((s, x) => s + x.value, 0);
			await db.prepare('UPDATE posts SET score = ? WHERE id = ?').bind(score, r.post_id).run();
			await db.prepare('UPDATE post_listing SET score = ? WHERE post_id = ?').bind(score, r.post_id).run();
		}
	},
};
