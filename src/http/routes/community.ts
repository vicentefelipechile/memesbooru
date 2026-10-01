// =========================================================================================================
// COMMUNITY ROUTES
// =========================================================================================================
// Mounts artist, pool, forum, and wiki routes; handles contact submissions.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { Hono } from 'hono';
import { parseJsonBody } from '../../helpers/http';
import { CommunityService } from '../../services/community-service';
import { CommunityContactSchema } from '../../validators';
import { requireAuth, type AuthVariables } from '../middleware/auth';
import { fail } from '../responses';
import { artistAliasRoutes, artistRoutes, postArtistRoutes } from './community-artists';
import forumRoutes from './community-forum';
import { poolPostRoutes, poolRoutes } from './community-pools';
import wikiRoutes from './community-wiki';

// =========================================================================================================
// Routes
// =========================================================================================================

const router = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

router.route('/artists', artistRoutes);
router.route('/artist-aliases', artistAliasRoutes);
router.route('/post-artists', postArtistRoutes);
router.route('/pools', poolRoutes);
router.route('/pools/posts', poolPostRoutes);
router.route('/forum', forumRoutes);
router.route('/wiki', wikiRoutes);

router.post('/contact', requireAuth, async (c) => {
	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;

	const parsed = CommunityContactSchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'Validation error', 400, parsed.error.issues);

	await new CommunityService(c.env.DB).createContact(c.get('user'), parsed.data.subject, parsed.data.body);

	return c.json({ ok: true }, 201);
});

// =========================================================================================================
// Export
// =========================================================================================================

export default router;
