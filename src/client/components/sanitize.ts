// =========================================================================================================
// HTML SANITIZATION
// =========================================================================================================

import DOMPurify from 'dompurify';

export function sanitizeMarkup(html: string): string {
	return DOMPurify.sanitize(html);
}
