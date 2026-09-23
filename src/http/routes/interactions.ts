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
import { decodeCursor, encodeCursor } from '../../helpers/cursor';
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
	const parsedBody = await parseJsonBody(c);

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
	const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? 50)));
	const cursorValue = c.req.query('cursor');
	const decoded = cursorValue ? decodeCursor<{ favoritedAt: number; postId: number }>(cursorValue) : null;
	if (cursorValue && (!decoded || !Number.isFinite(decoded.favoritedAt) || !Number.isInteger(decoded.postId))) return fail(c, 'Invalid cursor', 400);
	const result = await service.listFavorites(viewer, limit, decoded ?? undefined);

	return c.json({ data: result.data, nextCursor: result.nextCursor ? encodeCursor({ favoritedAt: result.nextCursor.favoritedAt, postId: result.nextCursor.postId }) : null, hasMore: result.nextCursor !== null });
});

// =========================================================================================================
// Export
// =========================================================================================================

export default router;
