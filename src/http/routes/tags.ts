// =========================================================================================================
// TAG ROUTES
// =========================================================================================================
// Catalog lookup and editor-only tag / alias commands.
// =========================================================================================================

import { Hono } from 'hono';
import { z } from 'zod';
import { TagRepository } from '../../repositories/tag-repository';
import { TagService } from '../../services/tag-service';
import { BrowseTagsQuerySchema, TagDisplayNameSchema, TagInputSchema, TAG_CATEGORIES, parseQueryWithArrays } from '../../validators';
import { fail } from '../responses';
import { requireAuth, type AuthVariables } from '../middleware/auth';

// =========================================================================================================
// Schemas
// =========================================================================================================

const router = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const idSchema = z.coerce.number().int().positive();
const listSchema = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50), cursor: idSchema.optional(), q: z.string().max(100).default(''), category: z.enum(TAG_CATEGORIES).optional() });
const editSchema = z.object({ display_name: TagDisplayNameSchema, description: z.string().trim().max(2000).nullable().optional(), category: z.enum(TAG_CATEGORIES) });
const createSchema = z.object({ name: TagInputSchema, display_name: TagDisplayNameSchema.nullable().optional(), description: z.string().trim().max(2000).nullable().optional(), category: z.enum(TAG_CATEGORIES) });
const aliasSchema = z.object({ alias: TagInputSchema, tag: TagInputSchema });

// =========================================================================================================
// Catalog queries
// =========================================================================================================

router.get('/autocomplete', async (c) => {
	const parsed = z
		.string()
		.max(100)
		.safeParse(c.req.query('q') ?? '');
	if (!parsed.success) return fail(c, 'Invalid query', 400, parsed.error.issues);
	if (!parsed.data) return c.json({ tags: [] });
	const tags = await new TagRepository(c.env.DB).autocomplete(parsed.data, 20);
	c.header('Cache-Control', 'public, max-age=300');
	return c.json({ tags: tags.map((t) => ({ name: t.normalized_name, display: t.display_name, usage: t.usage_count })) });
});

router.get('/', async (c) => {
	const parsed = listSchema.safeParse(parseQueryWithArrays(c.req.url));
	if (!parsed.success) return fail(c, 'Invalid query', 400, parsed.error.issues);
	return c.json(await new TagService(c.env.DB).list(parsed.data.limit, parsed.data.cursor, parsed.data.q, parsed.data.category));
});

router.get('/aliases', async (c) => {
	const parsed = listSchema.safeParse(parseQueryWithArrays(c.req.url));
	if (!parsed.success) return fail(c, 'Invalid query', 400, parsed.error.issues);
	return c.json(await new TagService(c.env.DB).listAliases(parsed.data.limit, parsed.data.cursor, parsed.data.q));
});

router.get('/browse', async (c) => {
	const input = parseQueryWithArrays(c.req.url);
	if (c.req.query('per')) input['limit'] = c.req.query('per')!;
	const parsed = BrowseTagsQuerySchema.safeParse(input);
	if (!parsed.success) return fail(c, 'Invalid query', 400, parsed.error.issues);
	c.header('Cache-Control', 'public, max-age=300');
	return c.json(await new TagService(c.env.DB).browse({ perCategoryLimit: parsed.data.limit }));
});

router.get('/browse/:category', async (c) => {
	const parsed = BrowseTagsQuerySchema.safeParse({ category: c.req.param('category'), limit: c.req.query('limit'), offset: c.req.query('offset') });
	if (!parsed.success || !parsed.data.category) return fail(c, 'Invalid query', 400, parsed.error?.issues);
	c.header('Cache-Control', 'public, max-age=300');
	return c.json(await new TagService(c.env.DB).browseCategory(parsed.data.category, { limit: parsed.data.limit, offset: parsed.data.offset }));
});

router.get('/by-id/:id', async (c) => {
	const id = idSchema.safeParse(c.req.param('id'));
	if (!id.success) return fail(c, 'Invalid tag ID', 400, id.error.issues);
	return c.json(await new TagService(c.env.DB).get(id.data));
});

router.get('/aliases/:id', async (c) => {
	const id = idSchema.safeParse(c.req.param('id'));
	if (!id.success) return fail(c, 'Invalid alias ID', 400, id.error.issues);
	return c.json(await new TagService(c.env.DB).getAlias(id.data));
});

router.get('/:id/history', async (c) => {
	const id = idSchema.safeParse(c.req.param('id'));
	if (!id.success) return fail(c, 'Invalid tag ID', 400, id.error.issues);
	return c.json({ data: await new TagService(c.env.DB).listHistory(id.data) });
});

// =========================================================================================================
// Editor commands
// =========================================================================================================

router.post('/', requireAuth, async (c) => {
	const parsed = createSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return fail(c, 'Invalid body', 400, parsed.error.issues);
	return c.json(await new TagService(c.env.DB).create(parsed.data.name, parsed.data.display_name ?? null, parsed.data.description ?? null, parsed.data.category, c.get('user')), 201);
});

router.post('/:id/edit', requireAuth, async (c) => {
	const id = idSchema.safeParse(c.req.param('id'));
	if (!id.success) return fail(c, 'Invalid tag ID', 400, id.error.issues);
	const parsed = editSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return fail(c, 'Invalid body', 400, parsed.error.issues);
	await new TagService(c.env.DB).update(id.data, parsed.data.display_name, parsed.data.description, parsed.data.category, c.get('user'));
	return c.json({ ok: true });
});

router.post('/:id/revert', requireAuth, async (c) => {
	const id = idSchema.safeParse(c.req.param('id'));
	if (!id.success) return fail(c, 'Invalid tag ID', 400, id.error.issues);
	const parsed = z.object({ history_id: idSchema }).safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return fail(c, 'Invalid body', 400, parsed.error.issues);
	await new TagService(c.env.DB).revert(id.data, parsed.data.history_id, c.get('user'));
	return c.json({ ok: true });
});

router.post('/aliases', requireAuth, async (c) => {
	const parsed = aliasSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return fail(c, 'Invalid body', 400, parsed.error.issues);
	await new TagService(c.env.DB).addAlias(parsed.data.alias, parsed.data.tag, c.get('user'));
	return c.json({ ok: true }, 201);
});

router.patch('/aliases/:id', requireAuth, async (c) => {
	const id = idSchema.safeParse(c.req.param('id'));
	if (!id.success) return fail(c, 'Invalid alias ID', 400, id.error.issues);
	const parsed = aliasSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return fail(c, 'Invalid body', 400, parsed.error.issues);
	await new TagService(c.env.DB).updateAlias(id.data, parsed.data.alias, parsed.data.tag, c.get('user'));
	return c.json({ ok: true });
});

router.delete('/aliases/:id', requireAuth, async (c) => {
	const id = idSchema.safeParse(c.req.param('id'));
	if (!id.success) return fail(c, 'Invalid alias ID', 400, id.error.issues);
	await new TagService(c.env.DB).deleteAlias(id.data, c.get('user'));
	return c.json({ ok: true });
});

router.get('/:name', async (c) => c.json(await new TagService(c.env.DB).getByName(c.req.param('name'))));

export default router;
