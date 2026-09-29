// =========================================================================================================
// PERMISSION ROUTES
// =========================================================================================================
// Manage roles and membership. Authorization lives in PermissionService.
// =========================================================================================================

import { Hono } from 'hono';
import { z } from 'zod';
import { requireAuth, type AuthVariables } from '../middleware/auth';
import { fail } from '../responses';
import { parseJsonBody } from '../../helpers/http';
import { PermissionService } from '../../services/permission-service';
import { toUserId } from '../../types';
import { CreateRoleSchema, RoleAssignmentSchema, UpdateRoleSchema } from '../../validators';

const router = new Hono<{ Bindings: Env; Variables: AuthVariables }>();
const IdSchema = z.coerce.number().int().positive();

router.get('/roles', requireAuth, async (c) => c.json({ data: await new PermissionService(c.env.DB).list(c.get('user')) }));

router.post('/roles', requireAuth, async (c) => {
	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;
	const parsed = CreateRoleSchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'Invalid role', 400, parsed.error.issues);
	return c.json(await new PermissionService(c.env.DB).create(c.get('user'), parsed.data), 201);
});

router.patch('/roles/:roleId', requireAuth, async (c) => {
	const id = IdSchema.safeParse(c.req.param('roleId'));
	if (!id.success) return fail(c, 'Invalid role', 400, id.error.issues);
	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;
	const parsed = UpdateRoleSchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'Invalid role', 400, parsed.error.issues);
	await new PermissionService(c.env.DB).update(c.get('user'), id.data, parsed.data);
	return c.json({ ok: true });
});

router.delete('/roles/:roleId', requireAuth, async (c) => {
	const id = IdSchema.safeParse(c.req.param('roleId'));
	if (!id.success) return fail(c, 'Invalid role', 400, id.error.issues);
	await new PermissionService(c.env.DB).delete(c.get('user'), id.data);
	return c.json({ ok: true });
});

router.get('/users/:userId/roles', requireAuth, async (c) => {
	const id = IdSchema.safeParse(c.req.param('userId'));
	if (!id.success) return fail(c, 'Invalid user', 400, id.error.issues);
	return c.json({ data: await new PermissionService(c.env.DB).userRoles(c.get('user'), toUserId(id.data)) });
});

router.post('/users/:userId/roles', requireAuth, async (c) => {
	const id = IdSchema.safeParse(c.req.param('userId'));
	if (!id.success) return fail(c, 'Invalid user', 400, id.error.issues);
	const body = await parseJsonBody(c);
	if (!body.ok) return body.response;
	const parsed = RoleAssignmentSchema.safeParse(body.data);
	if (!parsed.success) return fail(c, 'Invalid role', 400, parsed.error.issues);
	await new PermissionService(c.env.DB).assign(c.get('user'), toUserId(id.data), parsed.data.role_id);
	return c.json({ ok: true }, 201);
});

router.delete('/users/:userId/roles/:roleId', requireAuth, async (c) => {
	const ids = z.object({ userId: IdSchema, roleId: IdSchema }).safeParse(c.req.param());
	if (!ids.success) return fail(c, 'Invalid IDs', 400, ids.error.issues);
	await new PermissionService(c.env.DB).revoke(c.get('user'), toUserId(ids.data.userId), ids.data.roleId);
	return c.json({ ok: true });
});

export default router;
