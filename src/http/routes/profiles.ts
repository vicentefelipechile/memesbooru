// =========================================================================================================
// PROFILE ROUTES
// =========================================================================================================
// Public profiles and authored posts, plus authenticated self-editing.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { Hono } from 'hono';
import { requireAuth, type AuthVariables } from '../middleware/auth';
import { fail } from '../responses';
import { parseJsonBody } from '../../helpers/http';
import { ProfileService } from '../../services/profile-service';
import { ProfilePostsQuerySchema, ProfileSchema, ProfileUsernameSchema, parseQueryWithArrays } from '../../validators';

// =========================================================================================================
// Endpoints
// =========================================================================================================

const router = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

router.put('/me', requireAuth, async (c) => {
	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;
	const parsed = ProfileSchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'Invalid profile', 400, parsed.error.issues);

	return c.json({ profile: await new ProfileService(c.env.DB).updateSelf(c.get('user'), parsed.data) });
});

router.get('/:username', async (c) => {
	const username = ProfileUsernameSchema.safeParse(c.req.param('username'));
	if (!username.success) return fail(c, 'Invalid username', 400, username.error.issues);

	return c.json({ profile: await new ProfileService(c.env.DB).get(username.data) });
});

router.get('/:username/posts', async (c) => {
	const username = ProfileUsernameSchema.safeParse(c.req.param('username'));
	const query = ProfilePostsQuerySchema.safeParse(parseQueryWithArrays(c.req.url));
	if (!username.success) return fail(c, 'Invalid username', 400, username.error.issues);
	if (!query.success) return fail(c, 'Invalid query', 400, query.error.issues);

	return c.json(await new ProfileService(c.env.DB).posts(username.data, query.data));
});

// =========================================================================================================
// Export
// =========================================================================================================

export default router;
