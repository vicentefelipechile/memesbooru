// =========================================================================================================
// POSTS ROUTES (v2)
// =========================================================================================================
// Thin handlers — search, detail, create, variants. Business in PostService.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { requireAuth, optionalAuth, type AuthVariables } from '../middleware/auth';
import { PostService } from '../../services/post-service';
import { fail } from '../responses';
import { CreatePostSchema, SearchQuerySchema } from '../../validators';

// =========================================================================================================
// Endpoints
// =========================================================================================================

const router = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// =========================================================================================================
// GET /api/posts
// Search with tags, sort, cursor. DB unconfigured returns empty (dev).
// =========================================================================================================

router.get('/', optionalAuth, async (c) => {
	const db = (c.env as unknown as { DB: D1Database }).DB as never;
	if (!db) return c.json({ data: [], nextCursor: null, hasMore: false, warning: 'DB no configurado (dev)' });
	const parsed = SearchQuerySchema.safeParse(Object.fromEntries(new URL(c.req.url).searchParams.entries()));
	if (!parsed.success) return fail(c, 'Invalid query', 400, parsed.error.issues);
	const service = new PostService(db);
	const result = await service.search({ tags: parsed.data.tags, sort: parsed.data.sort as never, cursor: parsed.data.cursor, limit: parsed.data.limit });
	return c.json(result);
});

// =========================================================================================================
// GET /api/posts/:publicId
// Detail with duplicate redirect + video gating.
// =========================================================================================================

router.get('/:publicId', optionalAuth, async (c) => {
	const db = (c.env as unknown as { DB: D1Database }).DB as never;
	if (!db) return fail(c, 'DB no configurado', 500);
	const publicId = c.req.param('publicId')!;
	const viewer = (c.get('user') as AuthVariables['user'] | undefined) ?? null;
	const service = new PostService(db);
	try {
		const result = await service.detail(publicId, viewer as never);
		c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');
		return c.json(result);
	} catch (e) {
		const details = (e as unknown as { details?: unknown }).details as { redirectTo?: string } | undefined;
		if (details?.redirectTo) return c.json({ redirectTo: details.redirectTo }, 302);
		throw e;
	}
});

// =========================================================================================================
// POST /api/posts
// Create post (requireAuth, R2/Queue injected).
// =========================================================================================================

router.post('/', requireAuth, zValidator('json', CreatePostSchema), async (c) => {
	const db = (c.env as unknown as { DB: D1Database }).DB as never;
	const viewer = c.get('user');
	const input = c.req.valid('json');
	const queue = (c.env as unknown as { MEDIA_QUEUE: Queue }).MEDIA_QUEUE;
	const service = new PostService(db);
	const result = await service.create(viewer as never, { title: input.title ?? null, tags: input.tags, mediaType: input.media_type }, queue);
	return c.json({ publicId: result.publicId, postId: result.postId, status: 'processing' }, 201);
});

// =========================================================================================================
// GET /api/posts/:publicId/variants/:variant
// Serve variant placeholder (R2 in Phase 5).
// =========================================================================================================

router.get('/:publicId/variants/:variant', async (c) => {
	const variant = c.req.param('variant')!;
	const publicId = c.req.param('publicId')!;
	if (!['low', 'medium', 'original'].includes(variant)) return fail(c, 'variant invalido', 400);
	if (variant === 'original') c.header('Cache-Control', 'private, no-store');
	else c.header('Cache-Control', 'public, max-age=31536000, immutable');
	return c.json({ message: `variante ${variant} para ${publicId} — integrar R2 en Fase 5`, key: `media/${publicId}/${variant}` });
});

// =========================================================================================================
// Export
// =========================================================================================================

export default router;
