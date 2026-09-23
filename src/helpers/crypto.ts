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

export async function encodePassword(password: string): Promise<ArrayBuffer> {
	const salt = crypto.getRandomValues(new Uint8Array(16));
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
	const hash = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, key, 256));
	const stored = new Uint8Array(salt.length + hash.length);
	stored.set(salt);
	stored.set(hash, salt.length);
	return stored.buffer;
}

export async function verifyPassword(password: string, stored: ArrayBuffer): Promise<boolean> {
	const salt = new Uint8Array(stored.slice(0, 16));
	const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
	const actual = new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 100_000, hash: 'SHA-256' }, key, 256));
	const expected = new Uint8Array(stored.slice(16));
	return actual.length === expected.length && actual.every((value, index) => value === expected[index]);
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
