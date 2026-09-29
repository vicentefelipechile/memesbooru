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

// =========================================================================================================
// Helpers
// =========================================================================================================

export async function verifyTurnstile(secret: string, token: string, action: TurnstileAction, hostname: string, clientIp?: string): Promise<boolean> {
	if (!secret || !token || token.length > 2048) return false;

	// Local origins are only accepted for requests to a local Worker; production never trusts localhost tokens.
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
		return parsed.success && parsed.data.success && parsed.data.action === action && allowed.includes(hostname) && parsed.data.hostname === hostname;
	} catch (error) {
		console.error('Turnstile verification failed', error instanceof Error ? error.message : String(error));
		return false;
	}
}
