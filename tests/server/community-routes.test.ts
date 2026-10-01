// =========================================================================================================
// COMMUNITY ROUTES
// =========================================================================================================
// The split routers keep their original public paths and write responses.
// =========================================================================================================

import { env } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { hashToken } from '../../src/helpers/crypto';
import worker from '../../src/index';
import { applySchema } from './apply-schema';

beforeAll(async () => {
	await applySchema(env.DB);
	await env.DB.prepare("INSERT INTO users (id, username, created_at) VALUES (1, 'editor', 1)").run();
	await env.DB.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (1, 1)').run();
	await env.DB.prepare("INSERT INTO posts (id, public_id, author_id, media_type, status, created_at, updated_at) VALUES (1, 'example', 1, 'image', 'available', 1, 1)").run();
	await env.DB.prepare("INSERT INTO tags (id, normalized_name, created_at, updated_at) VALUES (1, 'example', 1, 1)").run();
	await env.DB.prepare('INSERT INTO sessions (user_id, token_hash, created_at, expires_at, last_seen_at) VALUES (1, ?, ?, ?, ?)')
		.bind(await hashToken('community-session'), Date.now(), Date.now() + 60_000, Date.now())
		.run();
});

function request(method: string, path: string, body?: object): Promise<Response> {
	return worker.fetch(
		new Request(`http://localhost/api/community${path}`, { method, headers: { host: 'localhost', cookie: 'session=community-session', 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }),
		env,
	);
}

describe('community route mounting', () => {
	it('keeps directory, artist, pool, forum, wiki and contact endpoints reachable', async () => {
		for (const path of ['/artists', '/pools', '/forum/topics', '/forum/categories', '/wiki', '/post-artists/1']) {
			expect((await request('GET', path)).status).toBe(200);
		}

		for (const [path, body] of [
			['/artists', { name: 'Example artist' }],
			['/artist-aliases', { artist_id: 1, alias: 'example_alias' }],
			['/post-artists', { post_id: 1, artist_id: 1 }],
			['/pools', { name: 'Example pool' }],
			['/pools/posts', { pool_id: 1, post_id: 1 }],
			['/forum/topics', { category_id: 1, title: 'Example topic', body: 'First post' }],
			['/forum/replies', { topic_id: 1, body: 'Reply' }],
			['/wiki', { tag: 'example', title: 'Example wiki', body: 'First revision' }],
			['/wiki/1/revisions', { body: 'Updated revision' }],
			['/contact', { subject: 'Question', body: 'Hello' }],
		] as const) {
			expect((await request('POST', path, body)).status).toBe(201);
		}

		for (const path of ['/pools/1/posts', '/forum/topics/1/posts', '/forum/topics/1', '/wiki/1/revisions', '/post-artists/1']) {
			expect((await request('GET', path)).status).toBe(200);
		}

		expect((await request('PATCH', '/artists/1/status', { status: 'active' })).status).toBe(200);
		expect((await request('PATCH', '/forum/topics', { topic_id: 1, title: 'Renamed topic' })).status).toBe(200);
		expect((await request('PATCH', '/forum/topics/status', { topic_id: 1, status: 'open', pinned: false })).status).toBe(200);
		expect((await request('PATCH', '/forum/posts', { post_id: 1, body: 'Edited post' })).status).toBe(200);
		expect((await request('POST', '/pools/posts/reorder', { pool_id: 1, post_id: 1, position: 1 })).status).toBe(200);
		expect((await request('POST', '/wiki/1/revert', { revision_id: 1 })).status).toBe(200);
		expect((await request('DELETE', '/post-artists', { post_id: 1, artist_id: 1 })).status).toBe(200);
		expect((await request('DELETE', '/pools/posts', { pool_id: 1, post_id: 1 })).status).toBe(200);
	});

	it('returns consistent 400 responses for malformed and invalid JSON', async () => {
		const malformed = await worker.fetch(new Request('http://localhost/api/community/artists', { method: 'POST', headers: { host: 'localhost', cookie: 'session=community-session', 'content-type': 'application/json' }, body: '{bad' }), env);
		expect(malformed.status).toBe(400);
		expect(await malformed.json()).toEqual({ error: 'Invalid JSON' });
		expect((await request('POST', '/artists', { name: '' })).status).toBe(400);
		expect((await request('GET', '/wiki/bad/revisions')).status).toBe(400);
	});
});
