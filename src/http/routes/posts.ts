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
import { CreatePostSchema, SearchQuerySchema, TagInputSchema, parseQueryWithArrays } from '../../validators';
import { ForbiddenError, NotFoundError, ValidationError } from '../../domain/errors';
import { detectMime, imageDimensions, mp4DurationMs, validateFileSize } from '../../helpers/file-validation';

// =========================================================================================================
// Endpoints
// =========================================================================================================

const router = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
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
	const parsed = SearchQuerySchema.pick({ tags: true }).safeParse({ tags });
	if (!parsed.success) return fail(c, 'Invalid tags', 400, parsed.error.issues);
	const filtered = tags ? await service.search({ tags: parsed.data.tags, sort: 'recent', limit: 60 }) : null;
	const pid = filtered ? (filtered.data.length ? filtered.data[Math.floor(Math.random() * filtered.data.length)].public_id : null) : await service.random();

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

		c.header('Cache-Control', result.media_type === 'video' ? 'private, no-store' : 'public, max-age=60, stale-while-revalidate=120');

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
	if (parsed.data.media_type !== 'video' && parsed.data.tags.length > 20) return fail(c, 'demasiados tags', 400);

	const bytes = new Uint8Array(await file.arrayBuffer());
	const mimeType = detectMime(bytes);

	if (!mimeType) return fail(c, 'tipo de archivo no soportado', 400);

	if (!validateFileSize(mimeType, bytes.length)) return fail(c, 'archivo demasiado grande', 413);

	if ((parsed.data.media_type === 'video') !== (mimeType === 'video/mp4') || (parsed.data.media_type === 'gif') !== (mimeType === 'image/gif')) return fail(c, 'el tipo no coincide con el archivo', 400);
	if (parsed.data.media_type === 'video') {
		const duration = mp4DurationMs(bytes);
		if (!duration || duration > 60_000) return fail(c, 'el video debe ser MP4 valido de hasta 60 segundos', 400);
	}
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

router.put('/:publicId/tags', requireAuth, async (c) => {
	const parsed = z.object({ tags: z.array(TagInputSchema).min(1).max(50) }).safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return fail(c, 'Invalid tags', 400, parsed.error.issues);
	await new PostService(c.env.DB).replaceTags(c.get('user'), c.req.param('publicId')!, parsed.data.tags);
	return c.json({ ok: true });
});

// =========================================================================================================
// GET /api/posts/:publicId/variants/:variant
// Serve a public or private R2 variant.
// =========================================================================================================

router.get('/:publicId/variants/:variant', optionalAuth, async (c) => {
	const variant = c.req.param('variant')!;
	const publicId = c.req.param('publicId')!;
	const format = c.req.query('format');

	if (!['low', 'medium', 'original'].includes(variant)) return fail(c, 'variant invalido', 400);

	const post = await new PostService(c.env.DB).detail(publicId, c.get('user') ?? null);
	const publicPoster = post.media_type === 'video' && variant === 'low' && !format && !post.low_variant_key.startsWith('stream/');
	if (post.restricted && !publicPoster) throw new ForbiddenError('contenido restringido');
	if (post.media_type === 'video' && post.low_variant_key.startsWith('stream/')) {
		if (format) return fail(c, 'formato invalido', 400);
		const uid = post.low_variant_key.slice(7);
		const url = variant === 'low' ? `https://videodelivery.net/${uid}/thumbnails/thumbnail.jpg?width=175&height=160&fit=clip` : `https://iframe.videodelivery.net/${uid}`;

		return c.redirect(url, 302);
	}

	const allowedFormats = post.media_type === 'video' ? ['mp4'] : post.media_type === 'gif' ? (variant === 'low' ? ['gif', 'webp'] : ['gif']) : ['webp', 'png'];
	if (format && !allowedFormats.includes(format)) return fail(c, 'formato invalido', 400);
	const preferredKey = variant === 'low' ? post.low_variant_key : post.medium_variant_key;
	const objectKey = variant === 'original' && post.media_type === 'video' ? 'original.mp4' : variant === 'original' && (!format || post.media_type === 'gif') ? 'original' : format ? `${variant}.${format}` : preferredKey?.split('/').at(-1);
	const isVideoFile = post.media_type === 'video' && (variant !== 'low' || format === 'mp4');
	const rangeHeader = c.req.header('Range');
	const range = isVideoFile && rangeHeader ? { range: new Headers({ Range: rangeHeader }) } : undefined;
	let object = objectKey ? await c.env.MEDIA_BUCKET.get(`media/${publicId}/${objectKey}`, range) : null;
	if (!object && variant !== 'original' && !format && preferredKey?.endsWith('.avif')) object = await c.env.MEDIA_BUCKET.get(preferredKey);
	if (!object) throw new NotFoundError('variante no disponible');

	if (isVideoFile || (variant === 'original' && !format)) c.header('Cache-Control', 'private, no-store');
	else c.header('Cache-Control', 'public, max-age=31536000, immutable');

	if (object.httpMetadata?.contentType) c.header('Content-Type', object.httpMetadata.contentType);
	if (isVideoFile) c.header('Accept-Ranges', 'bytes');
	if (rangeHeader && isVideoFile && object.range) {
		const start = 'suffix' in object.range ? Math.max(0, object.size - object.range.suffix) : (object.range.offset ?? 0);
		const length = 'suffix' in object.range ? Math.min(object.size, object.range.suffix) : (object.range.length ?? object.size - start);
		c.header('Content-Range', `bytes ${start}-${start + length - 1}/${object.size}`);
		c.header('Content-Length', String(length));
	}

	return c.body(object.body, rangeHeader && isVideoFile && object.range ? 206 : 200);
});

// =========================================================================================================
// Export
// =========================================================================================================

export default router;
