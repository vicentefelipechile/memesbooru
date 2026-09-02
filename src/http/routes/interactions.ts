// =========================================================================================================
// INTERACTIONS ROUTES (v2)
// =========================================================================================================
// Ratings + favorites. All requireAuth. Queue injected for score recalc.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { Hono } from 'hono';
import { requireAuth, type AuthVariables } from '../middleware/auth';
import { InteractionService } from '../../services/interaction-service';
import { RatingSchema } from '../../validators';
import { fail } from '../responses';

// =========================================================================================================
// Endpoints
// =========================================================================================================

const router = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// =========================================================================================================
// POST /api/post/:publicId/rating
// Upsert rating value (-5..5 !=0) and enqueue score job.
// =========================================================================================================

router.post('/post/:publicId/rating', requireAuth, async (c) => {
	const db = (c.env as unknown as { DB: D1Database }).DB as never;
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return fail(c, 'Invalid JSON', 400);
	}
	const parsed = RatingSchema.safeParse(body);
	if (!parsed.success) return fail(c, 'Validation error', 400, parsed.error.issues);
	const publicId = c.req.param('publicId')!;
	const viewer = c.get('user');
	const queue = (c.env as unknown as { MEDIA_QUEUE: Queue }).MEDIA_QUEUE;
	const service = new InteractionService(db);
	await service.rate(viewer as never, publicId, parsed.data.value, queue);
	return c.json({ ok: true });
});

// =========================================================================================================
// POST /api/post/:publicId/favorite
// Favorite (idempotent).
// =========================================================================================================

router.post('/post/:publicId/favorite', requireAuth, async (c) => {
	const db = (c.env as unknown as { DB: D1Database }).DB as never;
	const publicId = c.req.param('publicId')!;
	const viewer = c.get('user');
	const service = new InteractionService(db);
	await service.favorite(viewer as never, publicId);
	return c.json({ ok: true });
});

// =========================================================================================================
// DELETE /api/post/:publicId/favorite
// Unfavorite.
// =========================================================================================================

router.delete('/post/:publicId/favorite', requireAuth, async (c) => {
	const db = (c.env as unknown as { DB: D1Database }).DB as never;
	const publicId = c.req.param('publicId')!;
	const viewer = c.get('user');
	const service = new InteractionService(db);
	await service.unfavorite(viewer as never, publicId);
	return c.json({ ok: true });
});

// =========================================================================================================
// GET /api/favorites
// List own favorites.
// =========================================================================================================

router.get('/favorites', requireAuth, async (c) => {
	const db = (c.env as unknown as { DB: D1Database }).DB as never;
	const viewer = c.get('user');
	const service = new InteractionService(db);
	const data = await service.listFavorites(viewer as never);
	return c.json({ data });
});

// =========================================================================================================
// Export
// =========================================================================================================

export default router;
