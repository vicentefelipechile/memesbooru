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
import { parseJsonBody } from '../../helpers/http';

// =========================================================================================================
// Endpoints
// =========================================================================================================

const router = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// =========================================================================================================
// POST /api/post/:publicId/rating
// Upsert rating value (-5..5 !=0) and enqueue score job.
// =========================================================================================================

router.post('/post/:publicId/rating', requireAuth, async (c) => {
	const db = c.env.DB;
	const parsedBody = await parseJsonBody<unknown>(c);
	if (!parsedBody.ok) return parsedBody.response;
	const parsed = RatingSchema.safeParse(parsedBody.data);
	if (!parsed.success) return fail(c, 'Validation error', 400, parsed.error.issues);
	const publicId = c.req.param('publicId')!;
	const viewer = c.get('user');
	const queue = c.env.MEDIA_QUEUE;
	const service = new InteractionService(db);
	await service.rate(viewer, publicId, parsed.data.value, queue);
	return c.json({ ok: true });
});

// =========================================================================================================
// POST /api/post/:publicId/favorite
// Favorite (idempotent).
// =========================================================================================================

router.post('/post/:publicId/favorite', requireAuth, async (c) => {
	const db = c.env.DB;
	const publicId = c.req.param('publicId')!;
	const viewer = c.get('user');
	const service = new InteractionService(db);
	await service.favorite(viewer, publicId);
	return c.json({ ok: true });
});

// =========================================================================================================
// DELETE /api/post/:publicId/favorite
// Unfavorite.
// =========================================================================================================

router.delete('/post/:publicId/favorite', requireAuth, async (c) => {
	const db = c.env.DB;
	const publicId = c.req.param('publicId')!;
	const viewer = c.get('user');
	const service = new InteractionService(db);
	await service.unfavorite(viewer, publicId);
	return c.json({ ok: true });
});

// =========================================================================================================
// GET /api/favorites
// List own favorites.
// =========================================================================================================

router.get('/favorites', requireAuth, async (c) => {
	const db = c.env.DB;
	const viewer = c.get('user');
	const service = new InteractionService(db);
	const data = await service.listFavorites(viewer);
	return c.json({ data });
});

// =========================================================================================================
// Export
// =========================================================================================================

export default router;
