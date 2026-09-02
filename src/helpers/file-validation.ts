// =========================================================================================================
// FILE VALIDATION (v2)
// =========================================================================================================
// Validate by magic bytes, not extension. Enforce per-type size limits.
// =========================================================================================================

export function detectMime(bytes: Uint8Array): string | null {
	if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
	if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
	if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
	if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
	if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x00) return 'video/mp4';
	return null;
}

export const MAX_FILE_SIZES = {
	'image/jpeg': 10 * 1024 * 1024,
	'image/png': 10 * 1024 * 1024,
	'image/webp': 10 * 1024 * 1024,
	'image/gif': 20 * 1024 * 1024,
	'video/mp4': 100 * 1024 * 1024,
	'video/webm': 100 * 1024 * 1024,
} as const satisfies Record<string, number>;

export function validateFileSize(mime: string, size: number): boolean {
	const max = (MAX_FILE_SIZES as Record<string, number>)[mime];
	if (!max) return false;
	return size <= max;
}

export function assertValidMime(mime: string): asserts mime is keyof typeof MAX_FILE_SIZES {
	if (!(mime in MAX_FILE_SIZES)) throw new Error(`Unsupported mime: ${mime}`);
}
