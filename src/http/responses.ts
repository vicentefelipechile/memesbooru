// =========================================================================================================
// HTTP RESPONSES (v2)
// =========================================================================================================
// Generic helpers — fail() for pre-service rejections, ok() for success.
// =========================================================================================================

import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ErrorDetails } from '../types';

export function fail(c: Context, message: string, status: ContentfulStatusCode = 400, details?: ErrorDetails) {
	return c.json(details === undefined ? { error: message } : { error: message, details }, status);
}

export function ok<T>(c: Context, payload: T, status: ContentfulStatusCode = 200) {
	return c.json(payload, status);
}
