// =========================================================================================================
// FILE VALIDATION (v2)
// =========================================================================================================
// Validate by magic bytes, not extension. Enforce per-type size limits.
// =========================================================================================================

export function detectMime(bytes: Uint8Array): string | null {
	if (bytes[0] === 0xff && bytes[1] === 0xd8) return 'image/jpeg';
	if (bytes[0] === 0x89 && bytes[1] === 0x50) return 'image/png';
	if (bytes[0] === 0x47 && bytes[1] === 0x49) return 'image/gif';
	if (bytes.length > 12 && bytes.slice(0, 4).toString() === 'RIFF' && bytes.slice(8, 12).toString() === 'WEBP') return 'image/webp';
	if (bytes[0] === 0x00 && bytes[1] === 0x00 && bytes[2] === 0x00) return 'video/mp4';
	return null;
}

export const MAX_FILE_SIZES: Record<string, number> = {
	'image/jpeg': 10 * 1024 * 1024,
	'image/png': 10 * 1024 * 1024,
	'image/webp': 10 * 1024 * 1024,
	'image/gif': 20 * 1024 * 1024,
	'video/mp4': 100 * 1024 * 1024,
	'video/webm': 100 * 1024 * 1024,
};

export function validateFileSize(mime: string, size: number): boolean {
	const max = MAX_FILE_SIZES[mime];
	if (!max) return false;
	return size <= max;
}
