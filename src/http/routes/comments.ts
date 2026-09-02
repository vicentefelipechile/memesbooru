// =========================================================================================================
// COMMENTS ROUTES (v2)
// =========================================================================================================
// List + create + soft delete. Auth via guards, validation via Zod.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { Hono } from 'hono';
import { requireAuth, type AuthVariables } from '../middleware/auth';
import { CommentService } from '../../services/comment-service';
import { CommentSchema } from '../../validators';
import { fail } from '../responses';

// =========================================================================================================
// Endpoints
// =========================================================================================================

const router = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// =========================================================================================================
// GET /api/comments/post/:publicId
// List visible comments with cursor.
// =========================================================================================================

router.get('/post/:publicId', async (c) => {
	const db = (c.env as unknown as { DB: D1Database }).DB as never;
	if (!db) return fail(c, 'DB no configurado', 500);
	const publicId = c.req.param('publicId')!;
	const cursor = c.req.query('cursor');
	const limit = Math.min(50, parseInt(c.req.query('limit') ?? '20', 10));
	const service = new CommentService(db);
	const data = await service.listByPost(publicId, cursor, limit);
	return c.json({ data });
});

// =========================================================================================================
// POST /api/comments/post/:publicId
// Create comment (requireAuth).
// =========================================================================================================

router.post('/post/:publicId', requireAuth, async (c) => {
	const db = (c.env as unknown as { DB: D1Database }).DB as never;
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return fail(c, 'Invalid JSON', 400);
	}
	const parsed = CommentSchema.safeParse(body);
	if (!parsed.success) return fail(c, 'Validation error', 400, parsed.error.issues);
	const publicId = c.req.param('publicId')!;
	const viewer = c.get('user');
	const service = new CommentService(db);
	const result = await service.create(viewer as never, publicId, { body: parsed.data.body, parent_id: parsed.data.parent_id ?? null });
	return c.json(result, 201);
});

// =========================================================================================================
// DELETE /api/comments/:id
// Soft delete (author or admin).
// =========================================================================================================

router.delete('/:id', requireAuth, async (c) => {
	const db = (c.env as unknown as { DB: D1Database }).DB as never;
	const id = parseInt(c.req.param('id')!, 10);
	if (Number.isNaN(id)) return fail(c, 'Invalid id', 400);
	const viewer = c.get('user');
	const service = new CommentService(db);
	await service.remove(viewer as never, id);
	return c.json({ ok: true });
});

// =========================================================================================================
// Export
// =========================================================================================================

export default router;
