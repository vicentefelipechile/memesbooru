// =========================================================================================================
// Pure rendering and cursor-history regression checks; no browser framework required.
// =========================================================================================================

import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderSidebar } from '../../src/client/components/sidebar';
import { renderPaginator } from '../../src/client/components/grid';
import { renderSubNav } from '../../src/client/components/sub-nav';
import { renderHeader } from '../../src/client/components/header';
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

	it('uses the public username URL as the only account profile destination', () => {
		vi.stubGlobal('location', { pathname: '/users/Tester' });
		const header = renderHeader({ username: 'Tester' });
		const menu = renderSubNav('/users/Tester', 'Tester');
		expect(header).toContain('href="/users/Tester"');
		expect(menu).toContain('href="/users/Tester"');
		expect(`${header}${menu}`).not.toMatch(/href="\/(account|profile)"|Editar perfil|@Tester|id="logout-btn"/);
	});

	it('uses one upload form and chooses the correct upload flow from the file type', async () => {
		const { mediaTypeForFile, renderUpload } = await import('../../src/client/pages/upload');
		const { store } = await import('../../src/client/state/store');
		const previousUser = store.get().user;
		store.set({ user: { id: 1, username: 'tester', roles: ['Administrator'] } });
		const html = await renderUpload();

		expect(html).toContain('video/mp4');
		expect(html).not.toContain('name="mediaType"');
		expect(mediaTypeForFile('image/png')).toBe('image');
		expect(mediaTypeForFile('image/gif')).toBe('gif');
		expect(mediaTypeForFile('video/mp4')).toBe('video');
		expect(mediaTypeForFile('application/pdf')).toBeNull();
		store.set({ user: previousUser });
	});

	it('shows public profile details and authored posts without duplicate account links', async () => {
		const { renderProfile } = await import('../../src/client/pages/profile');
		const { api } = await import('../../src/client/services/api');
		vi.stubGlobal('location', { href: 'https://memesbooru.example/users/tester' });
		const get = vi.spyOn(api.profiles, 'get').mockResolvedValue({ profile: { id: 1, username: 'tester', display_name: 'Tester', avatar_url: null, bio: null, roles: ['Member'], created_at: 1 } });
		const posts = vi.spyOn(api.profiles, 'posts').mockResolvedValue({ data: [], nextCursor: null });
		const html = await renderProfile('tester');

		expect(html).toContain('class="profile-layout"');
		expect(html).toContain('Sin biografia.');
		expect(html).toContain('Todavia no hay publicaciones.');
		expect(html).not.toMatch(/href="\/(settings|favorites)"|profile-form|Configuracion/);
		expect(html).not.toContain('→');
		expect(html).toContain('<h1>Tester</h1>');
		expect(html).toContain('Usuario tester');
		get.mockResolvedValue({ profile: { id: 1, username: 'tester', display_name: 'tester', avatar_url: null, bio: null, roles: ['Member'], created_at: 1 } });
		expect(await renderProfile('tester')).not.toContain('Usuario tester');
		posts.mockResolvedValue({ data: [{ public_id: 'meme', low_variant_key: 'low', score: 1, favorite_count: 0, media_type: 'image' }], nextCursor: 'next page' });
		const withPosts = await renderProfile('tester');
		expect(withPosts).toContain('href="/post/meme"');
		expect(withPosts).toContain('href="/users/tester?cursor=next%20page"');
		get.mockRestore();
		posts.mockRestore();
	});

	it('edits the public profile together with other account settings', async () => {
		const { renderSettings } = await import('../../src/client/pages/settings');
		const { store } = await import('../../src/client/state/store');
		const { api } = await import('../../src/client/services/api');
		const previousUser = store.get().user;
		store.set({ user: { id: 1, username: 'tester', roles: ['Member'] } });
		const get = vi.spyOn(api.profiles, 'get').mockResolvedValue({ profile: { id: 1, username: 'tester', display_name: 'Tester', avatar_url: null, bio: 'Hello', roles: ['Member'], created_at: 1 } });
		const html = await renderSettings();
		expect(html).toContain('id="profile-form"');
		expect(html).toContain('id="password-form"');
		expect(html).toContain('id="theme-select"');
		expect(html).toContain('id="logout-btn"');
		expect(html).toContain('href="/users/tester"');
		expect(html).not.toMatch(/→|@tester/);
		get.mockRestore();
		store.set({ user: previousUser });
	});

	it('shows role administration only to accounts with manage_roles', async () => {
		const { renderSettings } = await import('../../src/client/pages/settings');
		const { store } = await import('../../src/client/state/store');
		const { api } = await import('../../src/client/services/api');
		const previousUser = store.get().user;
		const profile = vi.spyOn(api.profiles, 'get').mockResolvedValue({ profile: { id: 1, username: 'admin', display_name: null, avatar_url: null, bio: null, roles: ['Administrator'], created_at: 1 } });
		const roles = vi.spyOn(api.permissions, 'list').mockResolvedValue({ data: [{ id: 1, name: 'Administrator', position: 100, managed: 1, permissions: ['manage_roles'] }] });
		store.set({ user: { id: 1, username: 'admin', permissions: ['manage_roles'] } });
		expect(await renderSettings()).toContain('id="role-form"');
		store.set({ user: { id: 1, username: 'admin', permissions: [] } });
		expect(await renderSettings()).not.toContain('id="role-form"');
		expect(roles).toHaveBeenCalledTimes(1);
		profile.mockRestore();
		roles.mockRestore();
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

	it('keeps login and registration blocked until their own verification widgets load', async () => {
		const { renderSection } = await import('../../src/client/pages/sections');
		for (const name of ['login', 'register']) {
			const html = await renderSection(name);
			expect(html).toContain('data-turnstile');
			expect(html).toContain('type="submit" disabled');
			expect(html).toContain('name="username"');
			expect(html).not.toMatch(/correo|type="email"|name="email"/i);
		}
	});

	it('renders explicit search and only populated tag categories with exact counts', () => {
		const html = renderSidebar([{ name: 'falling', category: 'reaction', count: 2345 }], 'dog -cat', 'recent');
		expect(html).toContain('type="submit"');
		expect(html).toContain('value="dog -cat"');
		expect(html).toContain('data-exclude="falling"');
		expect(html).toContain('2345');
		expect(html).not.toContain('data-cat="source"');
		expect(html).toContain('href="/posts?tags=falling"');
	});

	it('keeps tag and alias editor links restricted and directory names searchable', async () => {
		const { renderSection } = await import('../../src/client/pages/sections');
		const { store } = await import('../../src/client/state/store');
		const { api } = await import('../../src/client/services/api');
		vi.stubGlobal('location', { href: 'https://memesbooru.example/tags' });
		const previous = store.get().user;
		store.set({ user: null });
		const list = vi.spyOn(api.tags, 'list').mockResolvedValue({ data: [{ id: 1, normalized_name: 'dog', display_name: null, description: null, category: 'character', usage_count: 1, status: 'active' }], nextCursor: 1 });
		expect(await renderSection('tags')).toContain('href="/posts?tags=dog"');
		expect(await renderSection('tags')).not.toContain('data-tag-edit');
		expect(renderSubNav('/aliases')).not.toContain('/aliases/create');
		store.set({ user: { id: 1, username: 'editor', permissions: ['edit_tags'] } });
		expect(renderSubNav('/aliases', 'editor', true)).toContain('/aliases/create');
		expect(await renderSection('tags', 'create')).toContain('name="name"');
		list.mockRestore();
		store.set({ user: previous });
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
		const { store } = await import('../../src/client/state/store');
		const previous = store.get().user;
		store.set({ user: { id: 1, username: 'editor', permissions: ['edit_tags'] } });

		for (const section of ['aliases', 'wiki']) {
			const html = await renderSection(section, 'create');
			expect(html).toContain('name="tag"');
			expect(html).toContain('data-single-tag');
			expect(html).not.toContain('Tag ID');
			expect(html).not.toContain('name="tag_id"');
		}
		store.set({ user: previous });
	});

	it('edits the selected tag with its description and readable meme categories', async () => {
		vi.stubGlobal('location', { href: 'https://memesbooru.example/tags/edit?id=1' });
		const { renderSection } = await import('../../src/client/pages/sections');
		const { api } = await import('../../src/client/services/api');
		const { store } = await import('../../src/client/state/store');
		const previous = store.get().user;
		store.set({ user: { id: 1, username: 'editor', permissions: ['edit_tags'] } });
		const get = vi.spyOn(api.tags, 'get').mockResolvedValue({ id: 1, normalized_name: 'cj', display_name: null, description: 'An existing description', category: 'character', usage_count: 1, status: 'active' });
		const html = await renderSection('tags', 'edit');

		expect(html).toContain('Editar tag: cj');
		expect(html).toContain('value="cj"');
		expect(html).toContain('Personajes ficticios');
		expect(html).toContain('value="character" selected');
		expect(html).toContain('name="description"');
		expect(html).toContain('An existing description');
		const pattern = html.match(/pattern="([^"]+)"/)?.[1];
		expect(pattern).toBeDefined();
		const validName = new RegExp(`^(?:${pattern})$`);
		expect(validName.test('cj_(personaje)')).toBe(true);
		expect(validName.test('asdasd asdas')).toBe(false);
		get.mockRestore();
		store.set({ user: previous });
	});

	it('loads an alias from the API before showing its edit form', async () => {
		vi.stubGlobal('location', { href: 'https://memesbooru.example/aliases/edit?id=7' });
		const { renderSection } = await import('../../src/client/pages/sections');
		const { api } = await import('../../src/client/services/api');
		const { store } = await import('../../src/client/state/store');
		const previous = store.get().user;
		store.set({ user: { id: 1, username: 'editor', permissions: ['edit_tags'] } });
		const get = vi.spyOn(api.tags, 'getAlias').mockResolvedValue({ id: 7, alias_normalized: 'puppy', normalized_name: 'dog', tag_id: 1, created_at: 1 });
		const html = await renderSection('aliases', 'edit');
		expect(html).toContain('value="puppy"');
		expect(html).toContain('name="tag" value="dog"');
		get.mockRestore();
		store.set({ user: previous });
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
