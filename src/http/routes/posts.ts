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
import { requireAuth, optionalAuth, type AuthVariables } from '../middleware/auth';
import { PostService } from '../../services/post-service';
import { fail } from '../responses';
import { CreatePostSchema, SearchQuerySchema, parseQueryWithArrays } from '../../validators';
import { ValidationError } from '../../domain/errors';
import { ForbiddenError } from '../../domain/errors';
import { detectMime, imageDimensions, validateFileSize } from '../../helpers/file-validation';
import { parseJsonBody } from '../../helpers/http';

// =========================================================================================================
// Endpoints
// =========================================================================================================

const router = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const streamCompleteSchema = z.object({ id: z.string().min(8).max(100), title: z.string().trim().max(120).nullable().optional(), tags: z.array(z.string().trim().min(1).max(100)).max(50) });

// =========================================================================================================
// GET /api/posts
// Search with tags, sort, cursor. DB unconfigured returns empty (dev).
// =========================================================================================================

router.get('/', optionalAuth, async (c) => {
	const db = c.env.DB;

	if (!db) return c.json({ data: [], tags: [], nextCursor: null, hasMore: false });

	const parsed = SearchQuerySchema.safeParse(parseQueryWithArrays(c.req.url));

	if (!parsed.success) return fail(c, 'Invalid query', 400, parsed.error.issues);

	const service = new PostService(db);
	const result = await service.search({ tags: parsed.data.tags, sort: parsed.data.sort, cursor: parsed.data.cursor, limit: parsed.data.limit });

	return c.json(result);
});

// =========================================================================================================
// GET /api/posts/random
// Returns { public_id } for a random available post (for Random nav).
// =========================================================================================================

router.get('/random', async (c) => {
	const db = c.env.DB;

	if (!db) return c.json({ public_id: null });

	const service = new PostService(db);
	const tags = c.req.query('tags');
	const filtered = tags ? await service.search({ tags, sort: 'recent', limit: 60 }) : null;
	const pid = filtered?.data.length ? filtered.data[Math.floor(Math.random() * filtered.data.length)].public_id : await service.random();

	if (!pid) return c.json({ public_id: null }, 404);

	c.header('Cache-Control', 'no-store');

	return c.json({ public_id: pid });
});

router.get('/top', async (c) => {
	const limit = Number(c.req.query('limit') ?? 100);
	const period = c.req.query('period') ?? 'all';
	const sort = c.req.query('sort') ?? 'score';
	if (!['all', 'day', 'week', 'month'].includes(period) || !['score', 'favorites', 'recent'].includes(sort)) return fail(c, 'Invalid top filters', 400);
	const data = await new PostService(c.env.DB).top(Number.isFinite(limit) ? limit : 100, period, sort as 'score' | 'favorites' | 'recent');
	return c.json({ data });
});

// =========================================================================================================
// GET /api/posts/:publicId
// Detail with duplicate redirect + video gating.
// =========================================================================================================

router.get('/:publicId', optionalAuth, async (c) => {
	const db = c.env.DB;
	const publicId = c.req.param('publicId')!;
	const viewer = c.get('user');
	const service = new PostService(db);

	try {
		const result = await service.detail(publicId, viewer ?? null);

		c.header('Cache-Control', 'public, max-age=60, stale-while-revalidate=120');

		return c.json(result);
	} catch (e) {
		if (e instanceof ValidationError && e.details && typeof e.details === 'object' && 'redirectTo' in e.details) {
			const redirectTo = (e.details as { redirectTo: string }).redirectTo;

			if (typeof redirectTo === 'string') return c.json({ redirectTo }, 302);
		}

		throw e;
	}
});

// =========================================================================================================
// POST /api/posts
// Create post (requireAuth, R2/Queue injected).
// =========================================================================================================

router.post('/', requireAuth, async (c) => {
	const db = c.env.DB;
	const viewer = c.get('user');
	const form = await c.req.raw.formData();
	const file = form.get('file');

	if (!(file instanceof File)) return fail(c, 'archivo requerido', 400);

	const parsed = CreatePostSchema.safeParse({
		title: form.get('title') || null,
		tags: String(form.get('tags') ?? '')
			.trim()
			.split(/\s+/)
			.filter(Boolean),
		media_type: form.get('media_type'),
	});

	if (!parsed.success) return fail(c, 'datos invalidos', 400, parsed.error.issues);

	const bytes = new Uint8Array(await file.arrayBuffer());
	const mimeType = detectMime(bytes);

	if (!mimeType) return fail(c, 'tipo de archivo no soportado', 400);

	if (!validateFileSize(mimeType, bytes.length)) return fail(c, 'archivo demasiado grande', 413);

	if ((parsed.data.media_type === 'video') !== mimeType.startsWith('video/')) return fail(c, 'el tipo no coincide con el archivo', 400);
	if (mimeType.startsWith('image/')) {
		const dimensions = imageDimensions(bytes, mimeType);
		if (!dimensions || dimensions.width < 1 || dimensions.height < 1 || dimensions.width > 10000 || dimensions.height > 10000) return fail(c, 'dimensiones de imagen invalidas', 400);
	}

	const checksum = await crypto.subtle.digest('SHA-256', bytes);
	const service = new PostService(db);

	const result = await service.create(viewer, {
		title: parsed.data.title ?? null,
		tags: parsed.data.tags,
		mediaType: parsed.data.media_type,
		checksum,
		mimeType,
		byteSize: bytes.length,
	});

	await c.env.MEDIA_BUCKET.put(`media/${result.publicId}/original`, bytes, { httpMetadata: { contentType: mimeType } });
	await c.env.MEDIA_QUEUE.send({ type: 'process_media', postId: result.postId });

	return c.json({ publicId: result.publicId, postId: result.postId, status: 'processing' }, 201);
});

router.post('/video/upload-url', requireAuth, async (c) => {
	const viewer = c.get('user');
	if (viewer.rank !== 'trusted') throw new ForbiddenError('videos solo para trusted');
	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;
	const metadata = z.object({ title: z.string().trim().max(120).nullable().optional(), tags: z.array(z.string().trim().min(1).max(100)).max(50) }).safeParse(body.data);
	if (!metadata.success) return fail(c, 'datos invalidos', 400, metadata.error.issues);
	const upload = await c.env.STREAM.createDirectUpload({
		maxDurationSeconds: 3600,
		creator: String(viewer.id),
		meta: { username: viewer.username, title: metadata.data.title ?? '', tags: metadata.data.tags.join(' ') },
	});
	return c.json({ uploadURL: upload.uploadURL, id: upload.id }, 201);
});

router.post('/video/complete', requireAuth, async (c) => {
	const viewer = c.get('user');
	if (viewer.rank !== 'trusted') throw new ForbiddenError('videos solo para trusted');

	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;
	const parsed = streamCompleteSchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'datos invalidos', 400, parsed.error.issues);

	const video = await c.env.STREAM.video(parsed.data.id).details();
	if (video.creator !== String(viewer.id)) return fail(c, 'upload no autorizado', 403);

	const result = await new PostService(c.env.DB).createStreamPost(viewer, parsed.data.title ?? null, parsed.data.tags, parsed.data.id);
	return c.json({ publicId: result.publicId, postId: result.postId, status: 'processing' }, 201);
});

// =========================================================================================================
// GET /api/posts/:publicId/variants/:variant
// Serve a public or private R2 variant.
// =========================================================================================================

router.get('/:publicId/variants/:variant', optionalAuth, async (c) => {
	const variant = c.req.param('variant')!;
	const publicId = c.req.param('publicId')!;

	if (!['low', 'medium', 'original'].includes(variant)) return fail(c, 'variant invalido', 400);

	const post = await new PostService(c.env.DB).detail(publicId, c.get('user') ?? null);
	if (post.restricted) return fail(c, 'contenido restringido', 403);
	if (post.media_type === 'video' && post.lowVariantKey?.startsWith('stream/')) return c.redirect(`https://iframe.videodelivery.net/${post.lowVariantKey.slice(7)}`, 302);

	const object = await c.env.MEDIA_BUCKET.get(`media/${publicId}/${variant === 'original' ? 'original' : `${variant}.avif`}`);
	if (!object) return fail(c, 'variante no disponible', 404);

	if (variant === 'original') c.header('Cache-Control', 'private, no-store');
	else c.header('Cache-Control', 'public, max-age=31536000, immutable');

	if (object.httpMetadata?.contentType) c.header('Content-Type', object.httpMetadata.contentType);
	return c.body(object.body);
});

// =========================================================================================================
// Export
// =========================================================================================================

export default router;
