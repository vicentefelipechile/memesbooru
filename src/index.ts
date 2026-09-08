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
import * as sessionRepo from './repositories/session-repository';
import * as postRepo from './repositories/post-repository';
import healthRoutes from './http/routes/health';
import authRoutes from './http/routes/auth';
import postRoutes from './http/routes/posts';
import tagRoutes from './http/routes/tags';
import commentRoutes from './http/routes/comments';
import interactionRoutes from './http/routes/interactions';
import moderationRoutes from './http/routes/moderation';
import { handleQueue } from './queues/processor';
import type { QueueMessage } from './types';

// =========================================================================================================
// App
// =========================================================================================================

const app = new Hono<{ Bindings: Env }>();

securityMiddleware(app);
registerRateLimits(app);

app.onError((err, c) => {
	if (err instanceof DomainError) {
		return c.json(err.details === undefined ? { error: err.message } : { error: err.message, details: err.details }, err.status as 400 | 401 | 403 | 404 | 409 | 410 | 429);
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
	async queue(batch: MessageBatch<QueueMessage>, env: Env) {
		await handleQueue(batch, env);
	},
	async scheduled(_event: ScheduledEvent, env: Env, _ctx: ExecutionContext) {
		const db = env.DB;

		await sessionRepo.cleanupExpired(db);

		const recent = await postRepo.findRecentlyRatedPostIds(db, 100);

		await postRepo.recalcScoreForPosts(db, recent);
	},
};
