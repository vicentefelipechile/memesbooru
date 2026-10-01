// =========================================================================================================
// COMMUNITY ARTIST ROUTES
// =========================================================================================================
// Artist directory, aliases, and post-artist relationships.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { Hono } from 'hono';
import { parseJsonBody } from '../../helpers/http';
import { CommunityService } from '../../services/community-service';
import { ArtistAliasSchema, ArtistStatusSchema, CommunityIdSchema, CommunityLimitSchema, CreateArtistSchema, PostArtistSchema } from '../../validators';
import { requireAuth, type AuthVariables } from '../middleware/auth';
import { fail } from '../responses';

// =========================================================================================================
// Artist directory and editor commands
// =========================================================================================================

const artistRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

artistRoutes.get('/', async (c) => {
	const data = await new CommunityService(c.env.DB).listArtists(CommunityLimitSchema.parse(c.req.query('limit')));

	return c.json({ data });
});

artistRoutes.post('/', requireAuth, async (c) => {
	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;

	const parsed = CreateArtistSchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'Validation error', 400, parsed.error.issues);

	await new CommunityService(c.env.DB).createArtist(c.get('user'), parsed.data.name);

	return c.json({ ok: true }, 201);
});

artistRoutes.patch('/:id/status', requireAuth, async (c) => {
	const id = CommunityIdSchema.safeParse(c.req.param('id'));
	if (!id.success) return fail(c, 'Invalid artist ID', 400, id.error.issues);

	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;

	const parsed = ArtistStatusSchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'Invalid body', 400, parsed.error.issues);

	await new CommunityService(c.env.DB).setArtistStatus(id.data, parsed.data.status, c.get('user'));

	return c.json({ ok: true });
});

// =========================================================================================================
// Aliases
// =========================================================================================================

const artistAliasRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

artistAliasRoutes.post('/', requireAuth, async (c) => {
	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;

	const parsed = ArtistAliasSchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'Invalid body', 400, parsed.error.issues);

	await new CommunityService(c.env.DB).addArtistAlias(c.get('user'), parsed.data.artist_id, parsed.data.alias);

	return c.json({ ok: true }, 201);
});

// =========================================================================================================
// Post artists
// =========================================================================================================

const postArtistRoutes = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

postArtistRoutes.get('/:postId', async (c) => {
	const id = CommunityIdSchema.safeParse(c.req.param('postId'));
	if (!id.success) return fail(c, 'Invalid post ID', 400, id.error.issues);

	const data = await new CommunityService(c.env.DB).listPostArtists(id.data);

	return c.json({ data });
});

postArtistRoutes.post('/', requireAuth, async (c) => {
	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;

	const parsed = PostArtistSchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'Invalid body', 400, parsed.error.issues);

	await new CommunityService(c.env.DB).addPostArtist(c.get('user'), parsed.data.post_id, parsed.data.artist_id);

	return c.json({ ok: true }, 201);
});

postArtistRoutes.delete('/', requireAuth, async (c) => {
	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;

	const parsed = PostArtistSchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'Invalid body', 400, parsed.error.issues);

	await new CommunityService(c.env.DB).removePostArtist(c.get('user'), parsed.data.post_id, parsed.data.artist_id);

	return c.json({ ok: true });
});

// =========================================================================================================
// Export
// =========================================================================================================

export { artistRoutes, artistAliasRoutes, postArtistRoutes };
