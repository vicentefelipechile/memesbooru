// =========================================================================================================
// TAGS ROUTES (v2)
// =========================================================================================================
// Autocomplete + detail. Read-only, no auth.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { Hono } from 'hono';
import * as tagRepo from '../../repositories/tag-repository';
import { TagService } from '../../services/tag-service';
import { BrowseTagsQuerySchema } from '../../validators';
import { fail } from '../responses';

// =========================================================================================================
// Endpoints
// =========================================================================================================

const router = new Hono<{ Bindings: Env }>();

// =========================================================================================================
// GET /api/tags/autocomplete?q=pe
// Prefix search ordered by usage_count.
// =========================================================================================================

router.get('/autocomplete', async (c) => {
	const db = c.env.DB;
	const q = c.req.query('q') ?? '';
	if (!q) return c.json({ tags: [] });
	const tags = await tagRepo.autocomplete(db, q, 20);
	c.header('Cache-Control', 'public, max-age=300');
	return c.json({ tags: tags.map((t) => ({ name: t.normalized_name, display: t.display_name, usage: t.usage_count })) });
});

// =========================================================================================================
// GET /api/tags/:name
// Exact tag lookup.
// =========================================================================================================

router.get('/:name', async (c) => {
	const db = c.env.DB;
	const name = c.req.param('name')!;
	const tags = await tagRepo.autocomplete(db, name, 1);
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
	const input: Record<string, unknown> = {};
	const per = c.req.query('per');
	if (per) input.limit = per;
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
