// =========================================================================================================
// TURNSTILE VALIDATION
// =========================================================================================================
// Only the server redeems single-use tokens; fail closed on invalid or unavailable verification.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { TurnstileSiteverifySchema } from '../validators';
import type { TurnstileAction } from '../validators';
import { isAllowedOrigin } from './net';

// =========================================================================================================
// Helpers
// =========================================================================================================

export async function verifyTurnstile(secret: string, token: string, action: TurnstileAction, hostname: string, origin?: string, clientIp?: string): Promise<boolean> {
	if (!secret || !token || token.length > 2048) return false;

	// Cross-origin clients solve the challenge on their own allowed origin, not the API host.
	if (origin && !isAllowedOrigin(origin)) return false;
	const expectedHostname = origin ? new URL(origin).hostname : hostname;
	const allowed = ['localhost', '127.0.0.1', 'memesbooru.cl', 'memesbooru.pages.dev', 'memesbooru.vicentefelipechile.workers.dev'];
	const body = new URLSearchParams({ secret, response: token });
	if (clientIp) body.set('remoteip', clientIp);

	try {
		const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
			method: 'POST',
			headers: { 'content-type': 'application/x-www-form-urlencoded' },
			body,
			signal: AbortSignal.timeout(10_000),
		});
		if (!response.ok) return false;

		const parsed = TurnstileSiteverifySchema.safeParse(await response.json());
		return parsed.success && parsed.data.success && parsed.data.action === action && allowed.includes(expectedHostname) && parsed.data.hostname === expectedHostname;
	} catch (error) {
		console.error('Turnstile verification failed', error instanceof Error ? error.message : String(error));
		return false;
	}
}
