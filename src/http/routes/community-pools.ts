// =========================================================================================================
// COMMUNITY POOL ROUTES
// =========================================================================================================
// Pool directory, creation, and post ordering.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { Hono } from 'hono';
import { parseJsonBody } from '../../helpers/http';
import { CommunityService } from '../../services/community-service';
import { CommunityIdSchema, CommunityLimitSchema, CreatePoolSchema, PoolOrderSchema, PoolPostSchema } from '../../validators';
import { requireAuth, type AuthVariables } from '../middleware/auth';
import { fail } from '../responses';

// =========================================================================================================
// Pools
// =========================================================================================================

const poolRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

poolRoutes.get('/', async (c) => {
	const data = await new CommunityService(c.env.DB).listPools(CommunityLimitSchema.parse(c.req.query('limit')));

	return c.json({ data });
});

poolRoutes.get('/:id/posts', async (c) => {
	const id = CommunityIdSchema.safeParse(c.req.param('id'));
	if (!id.success) return fail(c, 'Invalid pool ID', 400, id.error.issues);

	const data = await new CommunityService(c.env.DB).listPoolPosts(id.data);

	return c.json({ data });
});

poolRoutes.post('/', requireAuth, async (c) => {
	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;

	const parsed = CreatePoolSchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'Validation error', 400, parsed.error.issues);

	await new CommunityService(c.env.DB).createPool(c.get('user'), parsed.data.name, parsed.data.description ?? null);

	return c.json({ ok: true }, 201);
});

// =========================================================================================================
// Pool posts
// =========================================================================================================

const poolPostRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

poolPostRoutes.post('/', requireAuth, async (c) => {
	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;

	const parsed = PoolPostSchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'Validation error', 400, parsed.error.issues);

	await new CommunityService(c.env.DB).addPoolPost(c.get('user'), parsed.data.pool_id, parsed.data.post_id);

	return c.json({ ok: true }, 201);
});

poolPostRoutes.delete('/', requireAuth, async (c) => {
	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;

	const parsed = PoolPostSchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'Invalid body', 400, parsed.error.issues);

	await new CommunityService(c.env.DB).removePoolPost(parsed.data.pool_id, parsed.data.post_id, c.get('user'));

	return c.json({ ok: true });
});

poolPostRoutes.post('/reorder', requireAuth, async (c) => {
	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;

	const parsed = PoolOrderSchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'Invalid body', 400, parsed.error.issues);

	await new CommunityService(c.env.DB).reorderPoolPost(parsed.data.pool_id, parsed.data.post_id, parsed.data.position, c.get('user'));

	return c.json({ ok: true });
});

// =========================================================================================================
// Export
// =========================================================================================================

export { poolRoutes, poolPostRoutes };
