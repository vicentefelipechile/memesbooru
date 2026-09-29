// =========================================================================================================
// PROFILE INTEGRATION
// =========================================================================================================
// Public projection, authenticated writes, and stable authored-post cursors on real D1.
// =========================================================================================================

import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import initialSql from '../../migrations/0001_initial.sql?raw';
import credentialsSql from '../../migrations/0003_account_credentials.sql?raw';
import profilesSql from '../../migrations/0007_user_profiles.sql?raw';
import profileRoutes from '../../src/http/routes/profiles';
import { ProfileService } from '../../src/services/profile-service';
import { DomainError } from '../../src/domain/errors';
import { toUserId } from '../../src/types';
import { ProfileSchema } from '../../src/validators';
import { applyPermissions } from './apply-permissions';

beforeAll(async () => {
	const statements = `${initialSql}\n${credentialsSql}\n${profilesSql}`
		.replace(/--[^\n]*/g, '')
		.split(';')
		.map((sql) => sql.trim())
		.filter(Boolean);
	await env.DB.batch(statements.map((sql) => env.DB.prepare(sql)));
	await env.DB.prepare("INSERT INTO users (id, username, rank, created_at) VALUES (1, 'alice', 'new', 1), (2, 'blocked', 'new', 1)").run();
	await applyPermissions(env.DB);
	await env.DB.prepare("UPDATE users SET status = 'banned' WHERE id = 2").run();
	await env.DB.prepare("INSERT INTO posts (id, public_id, author_id, media_type, status, created_at, updated_at) VALUES (1, 'one', 1, 'image', 'available', 10, 10), (2, 'two', 1, 'image', 'available', 10, 10), (3, 'hidden', 1, 'image', 'hidden', 11, 11)").run();
	await env.DB.prepare("INSERT INTO post_listing (post_id, public_id, media_type, status, low_variant_key, published_at) VALUES (1, 'one', 'image', 'available', 'low', 10), (2, 'two', 'image', 'available', 'low', 10), (3, 'hidden', 'image', 'hidden', 'low', 11)").run();
});

describe('profiles', () => {
	it('exposes only public fields and excludes banned accounts', async () => {
		const response = await profileRoutes.fetch(new Request('http://localhost/alice'), env, {} as ExecutionContext);
		expect(response.status).toBe(200);
		const body = await response.json();
		expect(body).toMatchObject({ profile: { username: 'alice', bio: null } });
		expect(body.profile).not.toHaveProperty('email');
		await expect(new ProfileService(env.DB).get('blocked')).rejects.toThrow('Profile not found');
	});

	it('requires a session to edit and validates the profile payload', async () => {
		const app = new Hono<{ Bindings: Env }>();
		app.onError((error, c) => error instanceof DomainError ? c.json({ error: error.message }, 401) : c.json({ error: 'Unexpected' }, 500));
		app.route('/profiles', profileRoutes);
		const response = await app.fetch(new Request('http://localhost/profiles/me', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ display_name: 'Someone', bio: null, avatar_url: null }) }), env, {} as ExecutionContext);
		expect(response.status).toBe(401);
		expect(ProfileSchema.safeParse({ display_name: 'Alice', bio: null, avatar_url: 'javascript:alert(1)' }).success).toBe(false);
		expect(ProfileSchema.safeParse({ display_name: 'Alice', bio: null, avatar_url: 'http://example.com/avatar.png' }).success).toBe(false);
	});

	it('updates own public data and paginates only available posts with stable ties', async () => {
		const service = new ProfileService(env.DB);
		const user = { id: toUserId(1), username: 'alice', permissions: [], status: 'active' } as const;
		const profile = await service.updateSelf(user, { display_name: 'Alice', bio: 'Hello', avatar_url: 'https://example.com/avatar.png' });
		expect(profile).toMatchObject({ username: 'alice', display_name: 'Alice', bio: 'Hello' });
		const first = await service.posts('alice', { limit: 1 });
		expect(first.data.map((post) => post.public_id)).toEqual(['two']);
		expect(first.nextCursor).toBeTruthy();
		const second = await service.posts('alice', { limit: 1, cursor: first.nextCursor! });
		expect(second.data.map((post) => post.public_id)).toEqual(['one']);
		expect(second.nextCursor).toBeNull();
		await expect(service.posts('alice', { limit: 1, cursor: 'broken' })).rejects.toThrow('Invalid profile cursor');
	});
});
