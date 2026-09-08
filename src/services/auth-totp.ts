// =========================================================================================================
// AUTH TOTP HELPERS (v2)
// =========================================================================================================
// Pure TOTP helpers (base32 + verify + secret). No DB, no Hono.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { ValidationError } from '../domain/errors';

// =========================================================================================================
// Helpers
// =========================================================================================================

export function base32Decode(s: string): Uint8Array {
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
	s = s.replace(/=+$/, '').toUpperCase();

	let bits = 0;
	let value = 0;
	const out: number[] = [];

	for (const c of s) {
		const idx = alphabet.indexOf(c);

		if (idx === -1) throw new ValidationError('invalid base32');

		value = (value << 5) | idx;
		bits += 5;

		if (bits >= 8) {
			out.push((value >>> (bits - 8)) & 0xff);
			bits -= 8;
		}
	}

	return new Uint8Array(out);
}

export async function totpVerifyCode(secretBase32: string, token: string, window = 1): Promise<boolean> {
	const raw = base32Decode(secretBase32);
	const key = new Uint8Array(raw.length);
	key.set(raw);

	const cryptoKey = await crypto.subtle.importKey('raw', key, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);

	const step = 30;
	const now = Math.floor(Date.now() / 1000 / step);

	for (let i = -window; i <= window; i++) {
		const counter = now + i;
		const buf = new ArrayBuffer(8);
		new DataView(buf).setBigUint64(0, BigInt(counter), false);

		const sig = await crypto.subtle.sign('HMAC', cryptoKey, buf);
		const offset = new Uint8Array(sig)[19] & 0xf;
		const code = ((new DataView(sig).getUint32(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, '0');

		if (code === token) return true;
	}

	return false;
}

export function generateTotpSecretValue(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(20));
	const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

	let out = '';
	let bits = 0;
	let value = 0;

	for (const b of bytes) {
		value = (value << 8) | b;
		bits += 8;

		while (bits >= 5) {
			out += alphabet[(value >>> (bits - 5)) & 31];
			bits -= 5;
		}
	}

	if (bits > 0) out += alphabet[(value << (5 - bits)) & 31];

	while (out.length % 8 !== 0) out += '=';

	return out;
}
