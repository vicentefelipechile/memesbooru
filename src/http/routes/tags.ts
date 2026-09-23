// =========================================================================================================
// TAGS ROUTES (v2)
// =========================================================================================================
// Autocomplete + detail. Read-only, no auth.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { Hono } from 'hono';
import { TagRepository } from '../../repositories/tag-repository';
import { TagService } from '../../services/tag-service';
import { BrowseTagsQuerySchema, parseQueryWithArrays } from '../../validators';
import { fail } from '../responses';
import { requireAuth, type AuthVariables } from '../middleware/auth';
import { z } from 'zod';

// =========================================================================================================
// Endpoints
// =========================================================================================================

const router = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const editSchema = z.object({ display_name: z.string().trim().max(200).nullable(), description: z.string().trim().max(2000).nullable().optional(), category: z.enum(['reaction', 'source', 'people', 'character', 'meta']) });
const aliasSchema = z.object({ alias: z.string().trim().min(1).max(100), tag_id: z.number().int().positive() });

// =========================================================================================================
// GET /api/tags/autocomplete?q=pe
// Prefix search ordered by usage_count.
// =========================================================================================================

router.get('/autocomplete', async (c) => {
	const db = c.env.DB;
	const q = c.req.query('q') ?? '';

	if (!q) return c.json({ tags: [] });

	const tags = await new TagRepository(db).autocomplete(q, 20);

	c.header('Cache-Control', 'public, max-age=300');

	return c.json({ tags: tags.map((t) => ({ name: t.normalized_name, display: t.display_name, usage: t.usage_count })) });
});

router.get('/', async (c) => {
	const limit = Math.min(100, Math.max(1, Number(c.req.query('limit') ?? 100)));
	const offset = Math.max(0, Number(c.req.query('offset') ?? 0));
	return c.json({ data: await new TagService(c.env.DB).list(limit, offset) });
});

router.get('/aliases', async (c) => {
	return c.json({ data: await new TagService(c.env.DB).listAliases() });
});

router.get('/browse', async (c) => {
	const input = parseQueryWithArrays(c.req.url);
	const per = c.req.query('per');

	if (per) input['limit'] = per;

	const parsed = BrowseTagsQuerySchema.safeParse(input);

	if (!parsed.success) return fail(c, 'Invalid query', 400, parsed.error.issues);

	c.header('Cache-Control', 'public, max-age=300');
	return c.json(await new TagService(c.env.DB).browse({ perCategoryLimit: parsed.data.limit }));
});

router.get('/browse/:category', async (c) => {
	const category = c.req.param('category');
	const parsed = BrowseTagsQuerySchema.safeParse({
		category,
		limit: c.req.query('limit'),
		offset: c.req.query('offset'),
	});

	if (!parsed.success) return fail(c, 'Invalid query', 400, parsed.error.issues);

	c.header('Cache-Control', 'public, max-age=300');
	return c.json(await new TagService(c.env.DB).browseCategory(category, { limit: parsed.data.limit, offset: parsed.data.offset }));
});

router.post('/:id/edit', requireAuth, async (c) => {
	const parsed = editSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return fail(c, 'Invalid body', 400, parsed.error.issues);
	await new TagService(c.env.DB).update(Number(c.req.param('id')), parsed.data.display_name, parsed.data.description ?? null, parsed.data.category, c.get('user'));
	return c.json({ ok: true });
});

router.get('/:id/history', async (c) => c.json({ data: await new TagService(c.env.DB).listHistory(Number(c.req.param('id'))) }));

router.post('/:id/revert', requireAuth, async (c) => {
	const parsed = z.object({ history_id: z.number().int().positive() }).safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return fail(c, 'Invalid body', 400, parsed.error.issues);
	await new TagService(c.env.DB).revert(Number(c.req.param('id')), parsed.data.history_id, c.get('user'));
	return c.json({ ok: true });
});

router.post('/aliases', requireAuth, async (c) => {
	const parsed = aliasSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return fail(c, 'Invalid body', 400, parsed.error.issues);
	await new TagService(c.env.DB).addAlias(parsed.data.alias, parsed.data.tag_id, c.get('user'));
	return c.json({ ok: true }, 201);
});

// =========================================================================================================
// GET /api/tags/:name
// Exact tag lookup.
// =========================================================================================================

router.get('/:name', async (c) => {
	const db = c.env.DB;
	const name = c.req.param('name')!;
	const tags = await new TagRepository(db).autocomplete(name, 1);
	const t = tags.find((x) => x.normalized_name === name);

	if (!t) return fail(c, 'not found', 404);

	return c.json(t);
});

// =========================================================================================================
// GET /api/tags/browse?per=25
// Grouped top tags by category for sidebar. Cached.
// =========================================================================================================

router.get('/browse', async (c) => {
	const db = c.env.DB;
	const input = parseQueryWithArrays(c.req.url);
	const per = c.req.query('per');

	if (per) input['limit'] = per;

	const parsed = BrowseTagsQuerySchema.safeParse(input);

	if (!parsed.success) return fail(c, 'Invalid query', 400, parsed.error.issues);

	const service = new TagService(db);
	const result = await service.browse({ perCategoryLimit: parsed.data.limit });

	c.header('Cache-Control', 'public, max-age=300');

	return c.json(result);
});

// =========================================================================================================
// GET /api/tags/browse/:category?limit=50&offset=0
// Paged list for one category (for "show more").
// =========================================================================================================

router.get('/browse/:category', async (c) => {
	const db = c.env.DB;
	const cat = c.req.param('category')!;
	const allowed = ['reaction', 'source', 'people', 'character', 'meta'];

	if (!allowed.includes(cat)) return fail(c, 'invalid category', 400);

	const limit = c.req.query('limit');
	const offset = c.req.query('offset');
	const parsed = BrowseTagsQuerySchema.safeParse({ category: cat, limit, offset });

	if (!parsed.success) return fail(c, 'Invalid query', 400, parsed.error.issues);

	const service = new TagService(db);
	const result = await service.browseCategory(cat, { limit: parsed.data.limit, offset: parsed.data.offset });

	c.header('Cache-Control', 'public, max-age=300');

	return c.json(result);
});

// =========================================================================================================
// Export
// =========================================================================================================

export default router;
