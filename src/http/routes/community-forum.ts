// =========================================================================================================
// COMMUNITY FORUM ROUTES
// =========================================================================================================
// Topic lists, replies, and author or moderator updates.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { Hono } from 'hono';
import { parseJsonBody } from '../../helpers/http';
import { CommunityService } from '../../services/community-service';
import { CommunityIdSchema, CommunityLimitSchema, CreateReplySchema, CreateTopicSchema, ForumPostEditSchema, TopicEditSchema, TopicStatusSchema } from '../../validators';
import { requireAuth, type AuthVariables } from '../middleware/auth';
import { fail } from '../responses';

// =========================================================================================================
// Topics and categories
// =========================================================================================================

const router = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

router.get('/topics', async (c) => {
	const data = await new CommunityService(c.env.DB).listTopics(CommunityLimitSchema.parse(c.req.query('limit')));

	return c.json({ data });
});

router.get('/categories', async (c) => {
	const data = await new CommunityService(c.env.DB).listCategories();

	return c.json({ data });
});

router.get('/topics/:id/posts', async (c) => {
	const id = CommunityIdSchema.safeParse(c.req.param('id'));
	if (!id.success) return fail(c, 'Invalid topic ID', 400, id.error.issues);

	const data = await new CommunityService(c.env.DB).listForumPosts(id.data);

	return c.json({ data });
});

router.get('/topics/:id', async (c) => {
	const id = CommunityIdSchema.safeParse(c.req.param('id'));
	if (!id.success) return fail(c, 'Invalid topic ID', 400, id.error.issues);

	return c.json(await new CommunityService(c.env.DB).getTopic(id.data));
});

router.post('/topics', requireAuth, async (c) => {
	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;

	const parsed = CreateTopicSchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'Validation error', 400, parsed.error.issues);

	await new CommunityService(c.env.DB).createTopic(c.get('user'), parsed.data.category_id, parsed.data.title, parsed.data.body);

	return c.json({ ok: true }, 201);
});

router.patch('/topics', requireAuth, async (c) => {
	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;

	const parsed = TopicEditSchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'Invalid body', 400, parsed.error.issues);

	await new CommunityService(c.env.DB).updateTopic(c.get('user'), parsed.data.topic_id, parsed.data.title);

	return c.json({ ok: true });
});

router.patch('/topics/status', requireAuth, async (c) => {
	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;

	const parsed = TopicStatusSchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'Invalid body', 400, parsed.error.issues);

	await new CommunityService(c.env.DB).setTopicStatus(c.get('user'), parsed.data.topic_id, parsed.data.status, parsed.data.pinned);

	return c.json({ ok: true });
});

// =========================================================================================================
// Replies and posts
// =========================================================================================================

router.post('/replies', requireAuth, async (c) => {
	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;

	const parsed = CreateReplySchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'Validation error', 400, parsed.error.issues);

	await new CommunityService(c.env.DB).addReply(c.get('user'), parsed.data.topic_id, parsed.data.body);

	return c.json({ ok: true }, 201);
});

router.patch('/posts', requireAuth, async (c) => {
	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;

	const parsed = ForumPostEditSchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'Invalid body', 400, parsed.error.issues);

	await new CommunityService(c.env.DB).editForumPost(c.get('user'), parsed.data.post_id, parsed.data.body);

	return c.json({ ok: true });
});

// =========================================================================================================
// Export
// =========================================================================================================

export default router;
