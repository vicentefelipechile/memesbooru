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
import { ReportSchema, ModerationActionSchema } from '../../validators';
import { fail } from '../responses';
import { parseJsonBody } from '../../helpers/http';

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
	const parsedBody = await parseJsonBody(c);
	if (!parsedBody.ok) return parsedBody.response;
	const parsed = ReportSchema.safeParse(parsedBody.data);
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
	const parsedBody = await parseJsonBody(c);
	if (!parsedBody.ok) return parsedBody.response;
	const parsed = ModerationActionSchema.safeParse(parsedBody.data);
	if (!parsed.success) return fail(c, 'Validation error', 400, parsed.error.issues);
	const viewer = c.get('user');
	const service = new ModerationService(db);
	const result = await service.act(viewer, parsed.data);
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
