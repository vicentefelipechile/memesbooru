// =========================================================================================================
// FILE VALIDATION (v2)
// =========================================================================================================
// Validate by magic bytes, not extension. Enforce per-type size limits.
// =========================================================================================================

// =========================================================================================================
// Consts
// =========================================================================================================

export const MAX_FILE_SIZES = {
	'image/jpeg': 10 * 1024 * 1024,
	'image/png': 10 * 1024 * 1024,
	'image/webp': 10 * 1024 * 1024,
	'image/gif': 20 * 1024 * 1024,
	'video/mp4': 100 * 1024 * 1024,
	'video/webm': 100 * 1024 * 1024,
} as const satisfies Record<string, number>;

// =========================================================================================================
// Helpers
// =========================================================================================================

export function detectMime(bytes: Uint8Array): string | null {
	if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';

	if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';

	if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';

	if (isWebp(bytes)) return 'image/webp';

	if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x00) return 'video/mp4';

	return null;
}

function isWebp(bytes: Uint8Array): boolean {
	if (bytes.length < 12) return false;

	const riff = bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46;
	const webp = bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;

	return riff && webp;
}

export function validateFileSize(mime: string, size: number): boolean {
	const max = (MAX_FILE_SIZES as Record<string, number>)[mime];

	if (!max) return false;

	return size <= max;
}

export function imageDimensions(bytes: Uint8Array, mime: string): { width: number; height: number } | null {
	if (mime === 'image/png' && bytes.length >= 24) return { width: readU32(bytes, 16), height: readU32(bytes, 20) };
	if (mime === 'image/gif' && bytes.length >= 10) return { width: bytes[6] | (bytes[7] << 8), height: bytes[8] | (bytes[9] << 8) };
	if (mime === 'image/webp' && bytes.length >= 30 && bytes[12] === 0x56) return { width: 1 + readU24(bytes, 24), height: 1 + readU24(bytes, 27) };
	if (mime === 'image/jpeg') return jpegDimensions(bytes);
	return null;
}

function readU32(bytes: Uint8Array, offset: number): number {
	return bytes[offset] * 0x1000000 + ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]);
}

function readU24(bytes: Uint8Array, offset: number): number {
	return (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
	let offset = 2;
	while (offset + 9 < bytes.length) {
		if (bytes[offset] !== 0xff) {
			offset++;
			continue;
		}
		const marker = bytes[offset + 1];
		const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
		if (marker >= 0xc0 && marker <= 0xc3) return { height: (bytes[offset + 5] << 8) | bytes[offset + 6], width: (bytes[offset + 7] << 8) | bytes[offset + 8] };
		if (length < 2) return null;
		offset += 2 + length;
	}
	return null;
}

export function assertValidMime(mime: string): asserts mime is keyof typeof MAX_FILE_SIZES {
	if (!(mime in MAX_FILE_SIZES)) throw new Error(`Unsupported mime: ${mime}`);
}
