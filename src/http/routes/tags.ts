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
	const db = (c.env as unknown as { DB: D1Database }).DB as never;
	if (!db) return c.json({ tags: [] });
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
	const db = (c.env as unknown as { DB: D1Database }).DB as never;
	if (!db) return fail(c, 'DB no configurado', 500);
	const name = c.req.param('name')!;
	const tags = await tagRepo.autocomplete(db, name, 1);
	const t = tags.find((x) => x.normalized_name === name);
	if (!t) return fail(c, 'not found', 404);
	return c.json(t);
});

// =========================================================================================================
// Export
// =========================================================================================================

export default router;
