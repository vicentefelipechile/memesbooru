// =========================================================================================================
// ACCOUNT EMAIL BOUNDARY
// =========================================================================================================
// Only verified Google sign-ins can populate the stored email address.
// =========================================================================================================

import { env } from 'cloudflare:test';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import authRoutes from '../../src/http/routes/auth';
import { AuthService } from '../../src/services/auth-service';
import { CommunityService } from '../../src/services/community-service';
import { ProfileService } from '../../src/services/profile-service';
import { toUserId } from '../../src/types';
import { applySchema } from './apply-schema';

beforeAll(async () => {
	await applySchema(env.DB);
	await env.DB.prepare("INSERT INTO users (id, username, created_at) VALUES (1, 'old_local', 1), (2, 'old_google', 1)").run();
	await env.DB.prepare("INSERT INTO google_identities (user_id, google_subject, created_at) VALUES (2, 'google-old', 1)").run();
	await env.DB.prepare("INSERT INTO contact_tickets (id, subject, body, created_at, updated_at) VALUES (1, 'Hello', 'Help', 1, 1)").run();
});

afterEach(() => vi.unstubAllGlobals());

describe('account email boundary', () => {
	it('does not collect email in local accounts or contact tickets', async () => {
		const users = await env.DB.prepare('SELECT email FROM users ORDER BY id').all<{ email: string | null }>();
		expect(users.results).toEqual([{ email: null }, { email: null }]);
		const columns = await env.DB.prepare('PRAGMA table_info(contact_tickets)').all<{ name: string }>();
		expect(columns.results.map((row) => row.name)).not.toContain('email');
		const tables = await env.DB.prepare("SELECT name FROM sqlite_master WHERE name LIKE 'mail_%'").all<{ name: string }>();
		expect(tables.results).toEqual([]);
	});

	it('registers and authenticates by username without storing an address', async () => {
		const service = new AuthService(env.DB);
		const user = await service.register('only_username', 'password123');
		expect(await service.authenticatePassword('only_username', 'password123')).toMatchObject(user);
		await expect(service.authenticatePassword('only_username', 'wrongpass')).rejects.toMatchObject({ status: 401 });
		const row = await env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(user.id).first<{ email: string | null }>();
		expect(row?.email).toBeNull();
	});

	it('accepts registration and login without an email field at the HTTP boundary', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn().mockImplementation(async (_url: string, init: RequestInit) => new Response(JSON.stringify({ success: true, hostname: 'localhost', action: init.body instanceof URLSearchParams ? init.body.get('response') : null }))),
		);
		const submit = (path: string, username: string, turnstile_token: string) =>
			authRoutes.fetch(new Request(`http://localhost/${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username, password: 'password123', turnstile_token }) }), env);
		expect((await submit('register', 'route_user', 'signup')).status).toBe(201);
		expect((await submit('login', 'route_user', 'login')).status).toBe(200);
		const row = await env.DB.prepare("SELECT email FROM users WHERE username = 'route_user'").first<{ email: string | null }>();
		expect(row?.email).toBeNull();
	});

	it('saves email from Google userinfo on both new and returning sign-ins', async () => {
		vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ sub: 'google-new', email: 'new@google.cl' }))));
		const service = new AuthService(env.DB);
		const identity = await service.getGoogleUserInfo('access-token');
		const created = await service.findOrCreateUserBySub(identity.sub, identity.email);
		const email = await env.DB.prepare('SELECT email FROM users WHERE id = ?').bind(created.id).first<{ email: string | null }>();
		expect(email?.email).toBe('new@google.cl');
		await service.findOrCreateUserBySub('google-old', 'updated@google.cl');
		const updated = await env.DB.prepare('SELECT email FROM users WHERE id = 2').first<{ email: string | null }>();
		expect(updated?.email).toBe('updated@google.cl');
		expect(await new ProfileService(env.DB).get('old_google')).not.toHaveProperty('email');
	});

	it('allows authenticated contact messages without collecting an address', async () => {
		await new CommunityService(env.DB).createContact({ id: toUserId(1), username: 'old_local', status: 'active', permissions: ['contact'] }, 'Question', 'Details');
		const tickets = await new CommunityService(env.DB).listContacts(5);
		expect(tickets[0]).toMatchObject({ requester_id: 1, subject: 'Question', body: 'Details' });
	});
});
