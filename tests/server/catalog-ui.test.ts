// =========================================================================================================
// Pure rendering and cursor-history regression checks; no browser framework required.
// =========================================================================================================

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderSidebar } from '../../src/client/components/sidebar';
import { renderPaginator } from '../../src/client/components/grid';

beforeAll(() => vi.stubGlobal('localStorage', { getItem: () => 'android' }));
afterAll(() => vi.unstubAllGlobals());

describe('booru controls', () => {
	it('renders explicit search and only populated tag categories with exact counts', () => {
		const html = renderSidebar([{ name: 'falling', category: 'reaction', count: 2345 }], 'dog -cat', 'recent');
		expect(html).toContain('type="submit"');
		expect(html).toContain('value="dog -cat"');
		expect(html).toContain('data-exclude="falling"');
		expect(html).toContain('2345');
		expect(html).not.toContain('data-cat="source"');
	});

	it('does not create links for unknown intermediate pages', () => {
		const html = renderPaginator(5, [1, 5, 6], true, (page) => `/?tags=dog&page=${page}&cursor=saved`);
		expect(html).not.toContain('data-page="4"');
		expect(html).toContain('data-page="6"');
		expect(html).toContain('cursor=saved');
	});

	it('replaces the cursor at its page index instead of appending on back navigation', async () => {
		const { store, resetPagination, recordPage, cursorForPage } = await import('../../src/client/state/store');
		expect(store.get().theme).toBe('cyan');
		resetPagination();
		recordPage(1, 'second');
		recordPage(2, 'third');
		recordPage(1, 'second-updated');
		expect(cursorForPage(2)).toBe('second-updated');
		expect(cursorForPage(3)).toBeUndefined();
		recordPage(2, null);
		expect(cursorForPage(3)).toBeUndefined();
	});
});
