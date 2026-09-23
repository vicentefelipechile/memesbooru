// =========================================================================================================
// COMMUNITY ROUTES
// =========================================================================================================

import { Hono } from 'hono';
import { optionalAuth, requireAuth, type AuthVariables } from '../middleware/auth';
import { parseJsonBody } from '../../helpers/http';
import { fail } from '../responses';
import { z } from 'zod';
import { CommunityService } from '../../services/community-service';

const router = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const limitSchema = z.coerce.number().int().min(1).max(100).catch(50);
const artistSchema = z.object({ name: z.string().trim().min(1).max(100) });
const artistStatusSchema = z.object({ status: z.enum(['active', 'deleted']) });
const artistAliasSchema = z.object({ artist_id: z.number().int().positive(), alias: z.string().trim().min(1).max(100) });
const postArtistSchema = z.object({ post_id: z.number().int().positive(), artist_id: z.number().int().positive() });
const poolSchema = z.object({ name: z.string().trim().min(1).max(120), description: z.string().max(2000).nullable().optional() });
const topicSchema = z.object({ category_id: z.number().int().positive(), title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(5000) });
const wikiSchema = z.object({ tag_id: z.number().int().positive(), title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(10000) });
const replySchema = z.object({ topic_id: z.number().int().positive(), body: z.string().trim().min(1).max(5000) });
const poolPostSchema = z.object({ pool_id: z.number().int().positive(), post_id: z.number().int().positive() });
const wikiRevisionSchema = z.object({ body: z.string().trim().min(1).max(10000), reason: z.string().trim().max(200).nullable().optional() });
const wikiRevertSchema = z.object({ revision_id: z.number().int().positive() });
const contactSchema = z.object({ email: z.string().email().max(320), subject: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(10000) });
const mailSchema = z.object({ recipient_id: z.number().int().positive(), subject: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(10000) });
const poolOrderSchema = z.object({ pool_id: z.number().int().positive(), post_id: z.number().int().positive(), position: z.number().int().positive() });
const topicEditSchema = z.object({ topic_id: z.number().int().positive(), title: z.string().trim().min(1).max(200) });
const topicStatusSchema = z.object({ topic_id: z.number().int().positive(), status: z.enum(['open', 'locked', 'hidden']), pinned: z.boolean() });
const forumPostEditSchema = z.object({ post_id: z.number().int().positive(), body: z.string().trim().min(1).max(5000) });

router.get('/artists', async (c) => c.json({ data: await new CommunityService(c.env.DB).listArtists(limitSchema.parse(c.req.query('limit'))) }));
router.get('/post-artists/:postId', async (c) => c.json({ data: await new CommunityService(c.env.DB).listPostArtists(Number(c.req.param('postId'))) }));
router.get('/pools', async (c) => c.json({ data: await new CommunityService(c.env.DB).listPools(limitSchema.parse(c.req.query('limit'))) }));
router.get('/forum/topics', async (c) => c.json({ data: await new CommunityService(c.env.DB).listTopics(limitSchema.parse(c.req.query('limit'))) }));
router.get('/forum/categories', async (c) => c.json({ data: await new CommunityService(c.env.DB).listCategories() }));
router.get('/wiki', async (c) => c.json({ data: await new CommunityService(c.env.DB).listWiki(limitSchema.parse(c.req.query('limit'))) }));
router.get('/wiki/:id/revisions', async (c) => c.json({ data: await new CommunityService(c.env.DB).listWikiRevisions(Number(c.req.param('id'))) }));
router.get('/pools/:id/posts', async (c) => c.json({ data: await new CommunityService(c.env.DB).listPoolPosts(Number(c.req.param('id'))) }));
router.get('/forum/topics/:id/posts', async (c) => c.json({ data: await new CommunityService(c.env.DB).listForumPosts(Number(c.req.param('id'))) }));
router.get('/forum/topics/:id', async (c) => c.json(await new CommunityService(c.env.DB).getTopic(Number(c.req.param('id')))));
router.get('/mail', requireAuth, async (c) => c.json({ data: await new CommunityService(c.env.DB).listMail(c.get('user'), limitSchema.parse(c.req.query('limit'))) }));

router.post('/artists', requireAuth, async (c) => {
	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;
	const parsed = artistSchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'Validation error', 400, parsed.error.issues);
	await new CommunityService(c.env.DB).createArtist(c.get('user'), parsed.data.name);
	return c.json({ ok: true }, 201);
});

router.patch('/artists/:id/status', requireAuth, async (c) => {
	const parsed = artistStatusSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return fail(c, 'Invalid body', 400, parsed.error.issues);
	await new CommunityService(c.env.DB).setArtistStatus(Number(c.req.param('id')), parsed.data.status, c.get('user'));
	return c.json({ ok: true });
});

router.post('/artist-aliases', requireAuth, async (c) => {
	const parsed = artistAliasSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return fail(c, 'Invalid body', 400, parsed.error.issues);
	await new CommunityService(c.env.DB).addArtistAlias(parsed.data.artist_id, parsed.data.alias);
	return c.json({ ok: true }, 201);
});

router.post('/post-artists', requireAuth, async (c) => {
	const parsed = postArtistSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return fail(c, 'Invalid body', 400, parsed.error.issues);
	await new CommunityService(c.env.DB).addPostArtist(c.get('user'), parsed.data.post_id, parsed.data.artist_id);
	return c.json({ ok: true }, 201);
});

router.delete('/post-artists', requireAuth, async (c) => {
	const parsed = postArtistSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return fail(c, 'Invalid body', 400, parsed.error.issues);
	await new CommunityService(c.env.DB).removePostArtist(c.get('user'), parsed.data.post_id, parsed.data.artist_id);
	return c.json({ ok: true });
});

router.post('/pools', requireAuth, async (c) => {
	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;
	const parsed = poolSchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'Validation error', 400, parsed.error.issues);
	await new CommunityService(c.env.DB).createPool(c.get('user'), parsed.data.name, parsed.data.description ?? null);
	return c.json({ ok: true }, 201);
});

router.post('/forum/topics', requireAuth, async (c) => {
	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;
	const parsed = topicSchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'Validation error', 400, parsed.error.issues);
	await new CommunityService(c.env.DB).createTopic(c.get('user'), parsed.data.category_id, parsed.data.title, parsed.data.body);
	return c.json({ ok: true }, 201);
});

router.post('/wiki', requireAuth, async (c) => {
	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;
	const parsed = wikiSchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'Validation error', 400, parsed.error.issues);
	await new CommunityService(c.env.DB).createWiki(c.get('user'), parsed.data.tag_id, parsed.data.title, parsed.data.body);
	return c.json({ ok: true }, 201);
});

router.post('/forum/replies', requireAuth, async (c) => {
	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;
	const parsed = replySchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'Validation error', 400, parsed.error.issues);
	await new CommunityService(c.env.DB).addReply(c.get('user'), parsed.data.topic_id, parsed.data.body);
	return c.json({ ok: true }, 201);
});

router.post('/pools/posts', requireAuth, async (c) => {
	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;
	const parsed = poolPostSchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'Validation error', 400, parsed.error.issues);
	await new CommunityService(c.env.DB).addPoolPost(c.get('user'), parsed.data.pool_id, parsed.data.post_id);
	return c.json({ ok: true }, 201);
});

router.post('/wiki/:id/revisions', requireAuth, async (c) => {
	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;
	const parsed = wikiRevisionSchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'Validation error', 400, parsed.error.issues);
	await new CommunityService(c.env.DB).reviseWiki(c.get('user'), Number(c.req.param('id')), parsed.data.body, parsed.data.reason ?? null);
	return c.json({ ok: true }, 201);
});

router.post('/wiki/:id/revert', requireAuth, async (c) => {
	const parsed = wikiRevertSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return fail(c, 'Invalid body', 400, parsed.error.issues);
	await new CommunityService(c.env.DB).revertWiki(c.get('user'), Number(c.req.param('id')), parsed.data.revision_id);
	return c.json({ ok: true });
});

router.post('/mail', requireAuth, async (c) => {
	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;
	const parsed = mailSchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'Validation error', 400, parsed.error.issues);
	await new CommunityService(c.env.DB).createMail(c.get('user'), parsed.data.subject, parsed.data.body, parsed.data.recipient_id);
	return c.json({ ok: true }, 201);
});

router.post('/contact', optionalAuth, async (c) => {
	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;
	const parsed = contactSchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'Validation error', 400, parsed.error.issues);
	const user = c.get('user');
	await new CommunityService(c.env.DB).createContact(parsed.data.email, parsed.data.subject, parsed.data.body, user?.id ?? null);
	return c.json({ ok: true }, 201);
});

router.delete('/pools/posts', requireAuth, async (c) => {
	const parsed = poolPostSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return fail(c, 'Invalid body', 400, parsed.error.issues);
	await new CommunityService(c.env.DB).removePoolPost(parsed.data.pool_id, parsed.data.post_id, c.get('user'));
	return c.json({ ok: true });
});

router.post('/pools/posts/reorder', requireAuth, async (c) => {
	const parsed = poolOrderSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return fail(c, 'Invalid body', 400, parsed.error.issues);
	await new CommunityService(c.env.DB).reorderPoolPost(parsed.data.pool_id, parsed.data.post_id, parsed.data.position, c.get('user'));
	return c.json({ ok: true });
});

router.patch('/forum/topics', requireAuth, async (c) => {
	const parsed = topicEditSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return fail(c, 'Invalid body', 400, parsed.error.issues);
	await new CommunityService(c.env.DB).updateTopic(c.get('user'), parsed.data.topic_id, parsed.data.title);
	return c.json({ ok: true });
});

router.patch('/forum/topics/status', requireAuth, async (c) => {
	const parsed = topicStatusSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return fail(c, 'Invalid body', 400, parsed.error.issues);
	await new CommunityService(c.env.DB).setTopicStatus(c.get('user'), parsed.data.topic_id, parsed.data.status, parsed.data.pinned);
	return c.json({ ok: true });
});

router.patch('/forum/posts', requireAuth, async (c) => {
	const parsed = forumPostEditSchema.safeParse(await c.req.json().catch(() => null));
	if (!parsed.success) return fail(c, 'Invalid body', 400, parsed.error.issues);
	await new CommunityService(c.env.DB).editForumPost(c.get('user'), parsed.data.post_id, parsed.data.body);
	return c.json({ ok: true });
});

export default router;
