// =========================================================================================================
// MODERATION ROUTES (v2)
// =========================================================================================================
// Reports + actions. Actions require trusted (isAdmin).
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { Hono } from 'hono';
import { requireAuth, type AuthVariables } from '../middleware/auth';
import { ModerationService } from '../../services/moderation-service';
import { ReportSchema } from '../../validators';
import { fail } from '../responses';

// =========================================================================================================
// Endpoints
// =========================================================================================================

const router = new Hono<{ Bindings: Env; Variables: AuthVariables }>();

// =========================================================================================================
// POST /api/moderation/reports
// Any authenticated user can report.
// =========================================================================================================

router.post('/reports', requireAuth, async (c) => {
	const db = c.env.DB;
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return fail(c, 'Invalid JSON', 400);
	}
	const parsed = ReportSchema.safeParse(body);
	if (!parsed.success) return fail(c, 'Validation error', 400, parsed.error.issues);
	const viewer = c.get('user');
	const service = new ModerationService(db);
	const result = await service.report(viewer, parsed.data);
	return c.json(result, 201);
});

// =========================================================================================================
// POST /api/moderation/actions
// Trusted only.
// =========================================================================================================

router.post('/actions', requireAuth, async (c) => {
	const db = c.env.DB;
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return fail(c, 'Invalid JSON', 400);
	}
	if (typeof body !== 'object' || body === null) return fail(c, 'Invalid body', 400);
	if (!('target_type' in body) || !('target_id' in body) || !('action' in body)) return fail(c, 'Missing fields', 400);
	const target_type = Reflect.get(body, 'target_type');
	const target_id = Reflect.get(body, 'target_id');
	const action = Reflect.get(body, 'action');
	const reason = Reflect.get(body, 'reason');
	if (typeof target_type !== 'string' || typeof target_id !== 'number' || typeof action !== 'string') return fail(c, 'Invalid types', 400);
	if (reason !== undefined && typeof reason !== 'string') return fail(c, 'Invalid reason', 400);
	const viewer = c.get('user');
	const service = new ModerationService(db);
	const result = await service.act(viewer, { target_type, target_id, action, reason });
	return c.json(result);
});

// =========================================================================================================
// GET /api/moderation/reports
// List open reports (trusted).
// =========================================================================================================

router.get('/reports', requireAuth, async (c) => {
	const db = c.env.DB;
	const viewer = c.get('user');
	const service = new ModerationService(db);
	const data = await service.listReports(viewer);
	return c.json({ data });
});

// =========================================================================================================
// Export
// =========================================================================================================

export default router;
