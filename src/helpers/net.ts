// =========================================================================================================
// NET HELPERS (v2)
// =========================================================================================================
// Client IP and origin allowlist. Single source for rate-limits and security middleware.
// =========================================================================================================

// =========================================================================================================
// Types
// =========================================================================================================

export type HeaderReader = {
	req: { header: (name: string) => string | undefined; url?: string };
};

export type BareHeaderReader = {
	req: { header: (name: string) => string | undefined };
};

// =========================================================================================================
// Consts
// =========================================================================================================

export const ALLOWED_ORIGINS = ['http://localhost:5173', 'http://127.0.0.1:5173'] as const satisfies readonly string[];

// =========================================================================================================
// Helpers
// =========================================================================================================

export function isLocalRequest(c: HeaderReader): boolean {
	const host = c.req.header('host') ?? '';
	const hostname = host.split(':')[0];

	if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;

	// Vitest/miniflare no siempre envía Host header — fallback a URL
	try {
		const url = (c.req as { url?: string }).url ?? '';

		if (url) {
			const h = new URL(url).hostname;

			if (h === 'localhost' || h === '127.0.0.1' || h === '::1') return true;
		}
	} catch {}

	return false;
}

export function getClientIp(c: BareHeaderReader): string {
	return c.req.header('cf-connecting-ip') ?? 'unknown';
}

export function isAllowedOrigin(origin: string | undefined | null): boolean {
	if (!origin) return false;

	if ((ALLOWED_ORIGINS as readonly string[]).includes(origin)) return true;

	try {
		const url = new URL(origin);

		return url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1';
	} catch {
		return false;
	}
}
