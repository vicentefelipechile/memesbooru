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
import { CommentSchema, PaginationSchema } from '../../validators';
import { fail } from '../responses';
import { parseJsonBody } from '../../helpers/http';

// =========================================================================================================
// Endpoints
// =========================================================================================================

const router = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// =========================================================================================================
// GET /api/comments/post/:publicId
// List visible comments with cursor.
// =========================================================================================================

router.get('/post/:publicId', async (c) => {
	const db = c.env.DB;
	const publicId = c.req.param('publicId')!;
	const cursor = c.req.query('cursor');
	const pag = PaginationSchema.safeParse({ limit: c.req.query('limit'), page: undefined });
	const limit = pag.success ? Math.min(50, pag.data.limit) : 20;
	const service = new CommentService(db);
	const data = await service.listByPost(publicId, cursor, limit);
	return c.json({ data });
});

// =========================================================================================================
// POST /api/comments/post/:publicId
// Create comment (requireAuth).
// =========================================================================================================

router.post('/post/:publicId', requireAuth, async (c) => {
	const db = c.env.DB;
	const parsedBody = await parseJsonBody<unknown>(c);
	if (!parsedBody.ok) return parsedBody.response;
	const parsed = CommentSchema.safeParse(parsedBody.data);
	if (!parsed.success) return fail(c, 'Validation error', 400, parsed.error.issues);
	const publicId = c.req.param('publicId')!;
	const viewer = c.get('user');
	const service = new CommentService(db);
	const result = await service.create(viewer, publicId, { body: parsed.data.body, parent_id: parsed.data.parent_id ?? null });
	return c.json(result, 201);
});

// =========================================================================================================
// DELETE /api/comments/:id
// Soft delete (author or admin).
// =========================================================================================================

router.delete('/:id', requireAuth, async (c) => {
	const db = c.env.DB;
	const id = parseInt(c.req.param('id')!, 10);
	if (Number.isNaN(id)) return fail(c, 'Invalid id', 400);
	const viewer = c.get('user');
	const service = new CommentService(db);
	await service.remove(viewer, id);
	return c.json({ ok: true });
});

// =========================================================================================================
// Export
// =========================================================================================================

export default router;
