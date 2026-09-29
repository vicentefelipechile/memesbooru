// =========================================================================================================
// PERMISSIONS: migration, effective roles, revocation, and protected management.
// =========================================================================================================

import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';
import initialSql from '../../migrations/0001_initial.sql?raw';
import { PermissionService } from '../../src/services/permission-service';
import { ModerationService } from '../../src/services/moderation-service';
import { toUserId, type AuthUser } from '../../src/types';
import { hashToken } from '../../src/helpers/crypto';
import roleRoutes from '../../src/http/routes/permissions';
import { DomainError } from '../../src/domain/errors';
import { applyPermissions } from './apply-permissions';

beforeAll(async () => {
	const apply = async (sql: string) =>
		env.DB.batch(
			sql
				.replace(/--[^\n]*/g, '')
				.split(';')
				.map((statement) => statement.trim())
				.filter(Boolean)
				.map((statement) => env.DB.prepare(statement)),
		);
	await apply(initialSql);
	await env.DB.prepare("INSERT INTO users (id, username, rank, created_at) VALUES (1, 'owner', 'trusted', 1), (2, 'reader', 'normal', 1), (3, 'newcomer', 'new', 1)").run();
	await applyPermissions(env.DB);
});

describe('roles and permissions', () => {
	const service = new PermissionService(env.DB);
	const account = async (id: number): Promise<AuthUser> => ({ id: toUserId(id), username: `user${id}`, status: 'active', permissions: await service.forUser(toUserId(id)) });

	it('migrates old accounts, eliminates rank columns, and assigns a base role to new users', async () => {
		expect((await account(1)).permissions).toContain('manage_roles');
		expect((await account(2)).permissions).toContain('upload_without_cooldown');
		expect((await account(3)).permissions).not.toContain('upload_without_cooldown');
		expect((await env.DB.prepare('PRAGMA table_info(users)').all<{ name: string }>()).results.map((column) => column.name)).not.toContain('rank');
		await env.DB.prepare("INSERT INTO users (id, username, created_at) VALUES (4, 'next', 1)").run();
		expect((await service.userRolesForLogin(4)).map((role) => role.name)).toEqual(['Member']);
	});

	it('manages independent capabilities and revokes them without a new session', async () => {
		const owner = await account(1);
		const role = await service.create(owner, { name: 'Video publisher', permissions: ['upload_video'] });
		await service.assign(owner, toUserId(3), role.id);
		expect((await account(3)).permissions).toContain('upload_video');
		expect((await account(3)).permissions).not.toContain('moderate');
		await service.update(owner, role.id, { permissions: ['view_video'] });
		expect((await account(3)).permissions).toContain('view_video');
		expect((await account(3)).permissions).not.toContain('upload_video');
		await service.revoke(owner, toUserId(3), role.id);
		expect((await account(3)).permissions).not.toContain('view_video');
		await service.delete(owner, role.id);
	});

	it('guards management, managed roles, the last administrator and restricted accounts', async () => {
		await expect(service.create(await account(3), { name: 'Escalation', permissions: ['moderate'] })).rejects.toThrow('Permission denied');
		const owner = await account(1);
		await expect(service.create(owner, { name: 'Escalation', permissions: ['manage_roles'] })).rejects.toThrow('reserved');
		await expect(service.update(owner, 1, { name: 'Other' })).rejects.toThrow('Managed role');
		await expect(service.revoke(owner, toUserId(1), 1)).rejects.toThrow('last administrator');
		await expect(new ModerationService(env.DB).act(owner, { target_type: 'user', target_id: 1, action: 'ban' })).rejects.toThrow('Revoke administrator role');
		await env.DB.prepare("UPDATE users SET status = 'restricted' WHERE id = 2").run();
		expect((await account(2)).permissions).toEqual([]);
	});

	it('enforces role administration at the HTTP boundary with fresh session permissions', async () => {
		const app = new Hono<{ Bindings: Env }>();
		app.onError((error, c) => error instanceof DomainError ? c.json({ error: error.message }, error.status as 403) : c.json({ error: 'Unexpected' }, 500));
		app.route('/permissions', roleRoutes);
		for (const id of [1, 3]) await env.DB.prepare('INSERT INTO sessions (user_id, token_hash, created_at, expires_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').bind(id, await hashToken(`token-${id}`), Date.now(), Date.now() + 60000, Date.now()).run();
		const request = (userId: number) => app.fetch(new Request('http://localhost/permissions/roles', { method: 'POST', headers: { cookie: `session=token-${userId}`, 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Editors', permissions: ['edit_tags'] }) }), env);
		expect((await request(3)).status).toBe(403);
		expect((await request(1)).status).toBe(201);
		await service.assign(await account(1), toUserId(3), 1);
		expect((await app.fetch(new Request('http://localhost/permissions/roles', { headers: { cookie: 'session=token-3' } }), env)).status).toBe(200);
		await service.revoke(await account(1), toUserId(3), 1);
		expect((await app.fetch(new Request('http://localhost/permissions/roles', { headers: { cookie: 'session=token-3' } }), env)).status).toBe(403);
	});
});
