// =========================================================================================================
// CRYPTO HELPERS (v2)
// =========================================================================================================
// Single source for token hashing and base64url helpers. No crypto logic elsewhere.
// =========================================================================================================

// =========================================================================================================
// Helpers
// =========================================================================================================

export async function hashToken(token: string): Promise<ArrayBuffer> {
	return crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
}

export function b64url(bytes: Uint8Array): string {
	return btoa(String.fromCharCode(...bytes))
		.replace(/\+/g, '-')
		.replace(/\//g, '_')
		.replace(/=+$/, '');
}

export function b64urlDecodeToBytes(str: string): Uint8Array {
	const padded = str.replace(/-/g, '+').replace(/_/g, '/');
	const bin = atob(padded);
	const out = new Uint8Array(bin.length);

	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);

	return out;
}

// =========================================================================================================
// Export (backwards compat alias — use hashToken)
// =========================================================================================================

export const hashTokenSync = hashToken;
