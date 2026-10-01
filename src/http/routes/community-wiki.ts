// =========================================================================================================
// COMMUNITY WIKI ROUTES
// =========================================================================================================
// Pages and revision history, including revert.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { Hono } from 'hono';
import { parseJsonBody } from '../../helpers/http';
import { CommunityService } from '../../services/community-service';
import { CommunityIdSchema, CommunityLimitSchema, CreateWikiSchema, WikiRevertSchema, WikiRevisionSchema } from '../../validators';
import { requireAuth, type AuthVariables } from '../middleware/auth';
import { fail } from '../responses';

// =========================================================================================================
// Wiki pages
// =========================================================================================================

const router = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

router.get('/', async (c) => {
	const data = await new CommunityService(c.env.DB).listWiki(CommunityLimitSchema.parse(c.req.query('limit')));

	return c.json({ data });
});

router.get('/:id/revisions', async (c) => {
	const id = CommunityIdSchema.safeParse(c.req.param('id'));
	if (!id.success) return fail(c, 'Invalid wiki ID', 400, id.error.issues);

	const data = await new CommunityService(c.env.DB).listWikiRevisions(id.data);

	return c.json({ data });
});

router.post('/', requireAuth, async (c) => {
	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;

	const parsed = CreateWikiSchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'Validation error', 400, parsed.error.issues);

	await new CommunityService(c.env.DB).createWiki(c.get('user'), parsed.data.tag, parsed.data.title, parsed.data.body);

	return c.json({ ok: true }, 201);
});

// =========================================================================================================
// Revisions
// =========================================================================================================

router.post('/:id/revisions', requireAuth, async (c) => {
	const id = CommunityIdSchema.safeParse(c.req.param('id'));
	if (!id.success) return fail(c, 'Invalid wiki ID', 400, id.error.issues);

	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;

	const parsed = WikiRevisionSchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'Validation error', 400, parsed.error.issues);

	await new CommunityService(c.env.DB).reviseWiki(c.get('user'), id.data, parsed.data.body, parsed.data.reason ?? null);

	return c.json({ ok: true }, 201);
});

router.post('/:id/revert', requireAuth, async (c) => {
	const id = CommunityIdSchema.safeParse(c.req.param('id'));
	if (!id.success) return fail(c, 'Invalid wiki ID', 400, id.error.issues);

	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;

	const parsed = WikiRevertSchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'Invalid body', 400, parsed.error.issues);

	await new CommunityService(c.env.DB).revertWiki(c.get('user'), id.data, parsed.data.revision_id);

	return c.json({ ok: true });
});

// =========================================================================================================
// Export
// =========================================================================================================

export default router;
