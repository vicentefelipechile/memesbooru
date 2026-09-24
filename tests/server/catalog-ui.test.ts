// =========================================================================================================
// Pure rendering and cursor-history regression checks; no browser framework required.
// =========================================================================================================

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderSidebar } from '../../src/client/components/sidebar';
import { renderPaginator } from '../../src/client/components/grid';
import { renderSubNav } from '../../src/client/components/sub-nav';
import { completeTag } from '../../src/client/components/tag-autocomplete';

beforeAll(() => vi.stubGlobal('localStorage', { getItem: () => 'android' }));
afterAll(() => vi.unstubAllGlobals());

describe('booru controls', () => {
	it('shows section-specific links for posts, wiki and aliases', () => {
		expect(renderSubNav('/post/123')).toContain('href="/upload"');
		expect(renderSubNav('/post/123')).not.toContain('href="/upload/video"');
		expect(renderSubNav('/post/123')).not.toContain('href="/wiki/create"');
		expect(renderSubNav('/wiki')).toContain('href="/wiki/create"');
		expect(renderSubNav('/aliases')).toContain('href="/aliases"');
		expect(renderSubNav('/aliases')).not.toContain('href="/upload"');
	});

	it('uses one upload form and chooses the correct upload flow from the file type', async () => {
		const { mediaTypeForFile, renderUpload } = await import('../../src/client/pages/upload');
		const { store } = await import('../../src/client/state/store');
		const previousUser = store.get().user;
		store.set({ user: { id: 1, username: 'tester', rank: 'trusted' } });
		const html = await renderUpload();

		expect(html).toContain('video/mp4,video/webm');
		expect(html).not.toContain('name="mediaType"');
		expect(mediaTypeForFile('image/png')).toBe('image');
		expect(mediaTypeForFile('image/gif')).toBe('gif');
		expect(mediaTypeForFile('video/mp4')).toBe('video');
		expect(mediaTypeForFile('application/pdf')).toBeNull();
		store.set({ user: previousUser });
	});

	it('keeps profile details compact and its display-name field together', async () => {
		const { renderProfile } = await import('../../src/client/pages/profile');
		const { store } = await import('../../src/client/state/store');
		const previousUser = store.get().user;
		store.set({ user: { id: 1, username: 'tester', rank: 'new', status: 'active' } });
		const html = await renderProfile();

		expect(html).toContain('class="stat-grid profile-summary"');
		expect(html).toContain('<label for="display-name">Nombre visible<input');
		expect(html).not.toContain('<a href="/settings"');
		store.set({ user: previousUser });
	});

	it('keeps the wiki form off the listing and opens it on the create view', async () => {
		const { renderSection } = await import('../../src/client/pages/sections');
		const { api } = await import('../../src/client/services/api');
		const wiki = vi.spyOn(api.community, 'wiki').mockResolvedValue({ data: [] });
		const listing = await renderSection('wiki');
		const create = await renderSection('wiki', 'create');

		expect(listing).toContain('No hay artículos.');
		expect(listing).not.toContain('data-section-form');
		expect(create).toContain('data-section-form="wiki"');
		expect(create).not.toContain('No hay artículos.');
		expect(wiki).toHaveBeenCalledTimes(1);
		wiki.mockRestore();
	});

	it('renders explicit search and only populated tag categories with exact counts', () => {
		const html = renderSidebar([{ name: 'falling', category: 'reaction', count: 2345 }], 'dog -cat', 'recent');
		expect(html).toContain('type="submit"');
		expect(html).toContain('value="dog -cat"');
		expect(html).toContain('data-exclude="falling"');
		expect(html).toContain('2345');
		expect(html).not.toContain('data-cat="source"');
	});

	it('reuses the autocomplete field and completes only the final tag', async () => {
		const { renderLanding } = await import('../../src/client/pages/landing');
		const sidebar = renderSidebar([], 'pepe -wo', 'recent');
		const landing = renderLanding();

		expect(sidebar).toContain('class="tag-autocomplete-list"');
		expect(landing).toContain('class="tag-autocomplete-list"');
		expect(completeTag('pepe -wo', 'wojak')).toBe('pepe -wojak ');
		expect(completeTag('pepe wo', 'wojak')).toBe('pepe wojak ');
	});

	it('asks for tag names instead of tag IDs on every tag creation form', async () => {
		const { renderSection } = await import('../../src/client/pages/sections');

		for (const section of ['aliases', 'wiki']) {
			const html = await renderSection(section, 'create');
			expect(html).toContain('name="tag"');
			expect(html).toContain('data-single-tag');
			expect(html).not.toContain('Tag ID');
			expect(html).not.toContain('name="tag_id"');
		}
	});

	it('edits the selected tag with readable meme categories and no description field', async () => {
		vi.stubGlobal('location', { href: 'https://memesbooru.example/tags/edit?id=1' });
		const { renderSection } = await import('../../src/client/pages/sections');
		const { api } = await import('../../src/client/services/api');
		const get = vi.spyOn(api.tags, 'get').mockResolvedValue({ id: 1, normalized_name: 'cj', display_name: null, category: 'character' });
		const html = await renderSection('tags', 'edit');

		expect(html).toContain('Editar tag: cj');
		expect(html).toContain('value="cj"');
		expect(html).toContain('Personajes ficticios');
		expect(html).toContain('value="character" selected');
		expect(html).not.toContain('name="description"');
		const pattern = html.match(/pattern="([^"]+)"/)?.[1];
		expect(pattern).toBeDefined();
		const validName = new RegExp(`^(?:${pattern})$`);
		expect(validName.test('cj_(personaje)')).toBe(true);
		expect(validName.test('asdasd asdas')).toBe(false);
		get.mockRestore();
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
