// =========================================================================================================
// Domain errors reach the HTTP boundary with the right status and never mask missing resources.
// =========================================================================================================

import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { AuthService } from '../../src/services/auth-service';
import { CommentService } from '../../src/services/comment-service';
import { CommunityService } from '../../src/services/community-service';
import { PermissionService } from '../../src/services/permission-service';
import { PostService } from '../../src/services/post-service';
import { hashToken } from '../../src/helpers/crypto';
import { toUserId } from '../../src/types';
import worker from '../../src/index';
import { applySchema } from './apply-schema';

beforeAll(async () => {
	await applySchema(env.DB);
	await env.DB.prepare("INSERT INTO users (id, username, created_at) VALUES (1, 'admin', 1), (2, 'member', 1), (3, 'other', 1)").run();
	await env.DB.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (1, 1)').run();
	await env.DB.prepare("INSERT INTO posts (id, public_id, author_id, media_type, status, created_at, updated_at) VALUES (1, 'first', 2, 'image', 'available', 1, 1), (2, 'second', 2, 'image', 'available', 1, 1)").run();
	await env.DB.prepare("INSERT INTO tags (id, normalized_name, created_at, updated_at) VALUES (1, 'meme', 1, 1)").run();
	for (const id of [1, 2, 3]) {
		await env.DB.prepare('INSERT INTO sessions (user_id, token_hash, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)')
			.bind(id, await hashToken(`domain-${id}`), Date.now(), Date.now() + 60_000, Date.now())
			.run();
	}
});

function request(path: string, method = 'GET', body?: object, userId = 2): Promise<Response> {
	return worker.fetch(
		new Request(`http://localhost/api/${path}`, { method, headers: { host: 'localhost', cookie: `session=domain-${userId}`, 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }),
		env,
	);
}

describe('domain error boundaries', () => {
	it('uses unauthorized and conflict errors for account operations', async () => {
		const auth = new AuthService(env.DB);
		await expect(auth.authenticatePassword('missing', 'password123')).rejects.toMatchObject({ status: 401 });
		await expect(auth.register('member', 'password123')).rejects.toMatchObject({ status: 409 });
		expect((await request('auth/password', 'POST', { current_password: 'wrong', password: 'password123' })).status).toBe(401);
		expect((await request('auth/totp/verify', 'POST', { code: '123456' })).status).toBe(400);
	});

	it('validates reply ownership, depth and deletion in the service', async () => {
		const comments = new CommentService(env.DB);
		const author = { id: toUserId(2), username: 'member', status: 'active', permissions: ['comment'] } as const;
		const other = { ...author, id: toUserId(3) };
		const parent = await comments.create(author, 'first', { body: 'parent' });
		await expect(comments.create(author, 'second', { body: 'wrong post', parent_id: parent.id })).rejects.toMatchObject({ status: 400 });
		const reply = await comments.create(author, 'first', { body: 'reply', parent_id: parent.id });
		const grandchild = await comments.create(author, 'first', { body: 'grandchild', parent_id: reply.id });
		await expect(comments.create(author, 'first', { body: 'too deep', parent_id: grandchild.id })).rejects.toMatchObject({ status: 400 });
		await expect(comments.create(author, 'first', { body: 'missing', parent_id: 999 })).rejects.toMatchObject({ status: 404 });
		await expect(comments.remove(other, parent.id)).rejects.toMatchObject({ status: 403 });
		await expect(comments.remove(author, 999)).rejects.toMatchObject({ status: 404 });
		expect((await request(`comments/${parent.id}`, 'DELETE', undefined, 3)).status).toBe(403);
		expect((await request('comments/1garbage', 'DELETE')).status).toBe(400);
	});

	it('rejects missing community entities, duplicate wiki pages and unauthorized edits', async () => {
		const community = new CommunityService(env.DB);
		const member = { id: toUserId(2), username: 'member', status: 'active', permissions: ['create_topic'] } as const;
		const admin = { id: toUserId(1), username: 'admin', status: 'active', permissions: ['manage_artists', 'edit_wiki', 'edit_tags', 'manage_forum'] } as const;
		expect((await request('community/forum/topics/999')).status).toBe(404);
		expect((await request('community/forum/topics/not-an-id')).status).toBe(400);
		expect((await request('community/wiki/not-an-id/revisions')).status).toBe(400);
		expect((await request('community/forum/topics', 'POST', { category_id: 999, title: 'Topic', body: 'Body' })).status).toBe(404);
		expect((await request('community/artists/999/status', 'PATCH', { status: 'deleted' }, 1)).status).toBe(404);
		await community.createTopic(member, 1, 'Topic', 'Body');
		await expect(community.updateTopic(admin, 1, 'Edited')).rejects.toMatchObject({ status: 403 });
		await expect(community.addReply(member, 999, 'Reply')).rejects.toMatchObject({ status: 404 });
		await community.createWiki(admin, 'meme', 'Meme', 'First revision');
		await expect(community.createWiki(admin, 'meme', 'Meme', 'Duplicate')).rejects.toMatchObject({ status: 409 });
		await expect(community.revertWiki(admin, 1, 999)).rejects.toMatchObject({ status: 404 });
		await community.createArtist(admin, 'Gato');
		await expect(community.createArtist(admin, 'Gáto')).rejects.toMatchObject({ status: 409 });
		await expect(community.addArtistAlias(admin, 999, 'felino')).rejects.toMatchObject({ status: 404 });
		await community.addArtistAlias(admin, 1, 'Felino');
		await expect(community.addArtistAlias(admin, 1, 'félino')).rejects.toMatchObject({ status: 409 });
	});

	it('uses a conflict error when a post references a deprecated tag or alias', async () => {
		await env.DB.prepare("INSERT INTO tags (id, normalized_name, status, created_at, updated_at) VALUES (2, 'old', 'deprecated', 1, 1)").run();
		await env.DB.prepare("INSERT INTO tag_aliases (alias_normalized, tag_id, created_by, created_at) VALUES ('older', 2, 1, 1)").run();
		const author = { id: toUserId(2), username: 'member', status: 'active', permissions: [] } as const;
		await expect(new PostService(env.DB).replaceTags(author, 'first', ['old'])).rejects.toMatchObject({ status: 409 });
		await expect(new PostService(env.DB).replaceTags(author, 'first', ['older'])).rejects.toMatchObject({ status: 409 });
	});

	it('rejects nonexistent moderation targets and role assignments', async () => {
		expect((await request('moderation/reports', 'POST', { target_type: 'post', target_id: 999, reason: 'Missing' })).status).toBe(404);
		expect((await request('moderation/actions', 'POST', { target_type: 'user', target_id: 999, action: 'ban' }, 1)).status).toBe(404);
		expect((await request('moderation/actions', 'POST', { target_type: 'post', target_id: 1, action: 'ban' }, 1)).status).toBe(400);
		const permissions = new PermissionService(env.DB);
		const admin = { id: toUserId(1), username: 'admin', status: 'active', permissions: ['manage_roles'] } as const;
		await expect(permissions.revoke(admin, toUserId(2), 1)).rejects.toMatchObject({ status: 404 });
	});

	it('returns the central 429 error envelope for native rate limiting', async () => {
		const denied = { ...env, RL_GLOBAL: { limit: async () => ({ success: false }) } };
		const response = await worker.fetch(new Request('https://memes.example/api/health', { headers: { 'cf-connecting-ip': '203.0.113.1' } }), denied);
		expect(response.status).toBe(429);
		expect(await response.json()).toEqual({ error: 'Rate limited' });
	});
});
