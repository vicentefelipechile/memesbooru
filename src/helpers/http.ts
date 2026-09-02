// =========================================================================================================
// HTTP HELPERS (v2)
// =========================================================================================================
// Shared JSON parsing with uniform 400 handling.
// =========================================================================================================

import type { Context } from 'hono';
import { fail } from '../http/responses';

export async function parseJsonBody<T>(c: Context): Promise<{ ok: true; data: T } | { ok: false; response: Response }> {
	try {
		const data = (await c.req.json()) as T;
		return { ok: true, data };
	} catch {
		return { ok: false, response: fail(c, 'Invalid JSON', 400) };
	}
}
