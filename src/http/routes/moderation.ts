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
	const db = (c.env as unknown as { DB: D1Database }).DB as never;
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
	const result = await service.report(viewer as never, parsed.data);
	return c.json(result, 201);
});

// =========================================================================================================
// POST /api/moderation/actions
// Trusted only.
// =========================================================================================================

router.post('/actions', requireAuth, async (c) => {
	const db = (c.env as unknown as { DB: D1Database }).DB as never;
	let body: unknown;
	try {
		body = await c.req.json();
	} catch {
		return fail(c, 'Invalid JSON', 400);
	}
	const viewer = c.get('user');
	const service = new ModerationService(db);
	// service asserts trusted internally
	const result = await service.act(viewer as never, body as never);
	return c.json(result);
});

// =========================================================================================================
// GET /api/moderation/reports
// List open reports (trusted).
// =========================================================================================================

router.get('/reports', requireAuth, async (c) => {
	const db = (c.env as unknown as { DB: D1Database }).DB as never;
	const viewer = c.get('user');
	const service = new ModerationService(db);
	const data = await service.listReports(viewer as never);
	return c.json({ data });
});

// =========================================================================================================
// Export
// =========================================================================================================

export default router;
