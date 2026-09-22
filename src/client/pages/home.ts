// =========================================================================================================
// Booru catalog: persistent search input, atomic results/tags updates and explicit form submission.
// =========================================================================================================

import { renderAutocomplete, renderSortLinks } from '../components/search.js';
import { renderGrid, renderPaginator } from '../components/grid.js';
import { renderSidebar, renderPageTags } from '../components/sidebar.js';
import { store, cursorForPage, recordPage, setHasMore } from '../state/store.js';
import { buildSearchUrl, readSearchUrl } from '../state/catalog.js';
import { api } from '../services/api.js';

let requestVersion = 0;
type SearchResult = Awaited<ReturnType<typeof api.posts.find>>;

function renderResults(result: SearchResult): string {
	const state = store.get();
	const knownPages = [...new Set([1, state.currentPage, ...Object.entries(state.pages).flatMap(([index, entry]) => (entry.cursor ? [Number(index) + 2] : []))])].sort((a, b) => a - b);

	return renderGrid(result.data) + renderPaginator(state.currentPage, knownPages, result.hasMore, (page) => buildSearchUrl({ page }));
}

async function fetchPage(): Promise<SearchResult> {
	const state = store.get();
	const cursor = state.currentPage > 1 ? (new URLSearchParams(location.search).get('cursor') ?? cursorForPage(state.currentPage)) : undefined;

	return api.posts.find({ tags: state.tags.join(' '), sort: state.sort, cursor: cursor ?? undefined, limit: 42 });
}

function acceptPage(result: SearchResult): void {
	recordPage(store.get().currentPage, result.nextCursor);
	setHasMore(!!result.hasMore);
}

async function loadResults(): Promise<void> {
	readSearchUrl();
	const version = ++requestVersion;
	const url = location.href;
	const results = document.getElementById('results');
	const status = document.getElementById('status');
	results?.setAttribute('aria-busy', 'true');

	if (status) status.textContent = 'Buscando…';

	try {
		const result = await fetchPage();

		if (version !== requestVersion || location.href !== url || !results?.isConnected) return;

		acceptPage(result);
		results.innerHTML = renderResults(result);
		const tags = document.getElementById('page-tags');
		const sort = document.getElementById('sort-row');

		if (tags) tags.innerHTML = renderPageTags(result.tags);
		if (sort) sort.innerHTML = renderSortLinks(store.get().sort);
		if (status) status.textContent = '';
	} catch (error) {
		console.error('Catalog search failed', error);

		if (version === requestVersion && status?.isConnected) status.textContent = 'No se pudo cargar la búsqueda. Pulsa Buscar para reintentar.';
	} finally {
		if (version === requestVersion) results?.removeAttribute('aria-busy');
	}
}

function search(path: string): void {
	history.pushState(null, '', path);
	readSearchUrl();
	const input = document.getElementById('sidebar-tag-input');
	const autocomplete = document.getElementById('sidebar-autocomplete');

	if (input instanceof HTMLInputElement) input.value = store.get().query;
	if (autocomplete) autocomplete.innerHTML = '';

	void loadResults();
}

function editTag(tag: string, exclude: boolean): void {
	const tags = store.get().tags.filter((value) => value !== tag && value !== `-${tag}`);

	search(buildSearchUrl({ tags: [...tags, exclude ? `-${tag}` : tag] }));
}

export async function renderHome(): Promise<string> {
	readSearchUrl();
	const version = ++requestVersion;
	const result = await fetchPage();

	if (version !== requestVersion) return '';

	acceptPage(result);
	const state = store.get();

	return `<div class="home-layout">
		<aside class="home-side" id="home-side">${renderSidebar(result.tags, state.query, state.sort)}</aside>
		<div class="home-main"><div id="status" class="status-line" role="status"></div>
		<div id="results">${renderResults(result)}</div></div>
	</div>`;
}

export function bindHome(): void {
	const input = document.getElementById('sidebar-tag-input');
	const form = document.getElementById('sidebar-search');

	if (!(input instanceof HTMLInputElement) || !(form instanceof HTMLFormElement)) return;

	const tags = document.querySelector('.page-tags');

	if (tags instanceof HTMLDetailsElement && matchMedia('(max-width: 600px)').matches) tags.open = false;

	form.addEventListener('submit', (event) => {
		event.preventDefault();
		search(buildSearchUrl({ tags: [...new Set(input.value.trim().split(/\s+/).filter(Boolean))] }));
	});
	bindAutocomplete(input);
}

function bindAutocomplete(input: HTMLInputElement): void {
	let timer: number | undefined;
	let version = 0;
	const dropdown = document.getElementById('sidebar-autocomplete');
	input.addEventListener('input', () => {
		clearTimeout(timer);
		const current = ++version;
		const searchVersion = requestVersion;
		const value = input.value;
		const term = value.split(/\s+/).pop()?.replace(/^-/, '') ?? '';

		if (dropdown) dropdown.innerHTML = '';
		if (!term) return;

		timer = window.setTimeout(async () => {
			try {
				const result = await api.tags.autocomplete(term);

				if (current === version && searchVersion === requestVersion && input.isConnected && input.value === value && dropdown) dropdown.innerHTML = renderAutocomplete(result.tags);
			} catch (error) {
				console.error('Autocomplete failed', error);
			}
		}, 200);
	});
	input.addEventListener('keydown', (event) => {
		if (event.key === 'Escape') {
			version++;
			if (dropdown) dropdown.innerHTML = '';
		}
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			dropdown?.querySelector('a')?.focus();
		}
	});
}

export function bindHomeGlobal(): void {
	document.addEventListener('click', (event) => {
		if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || location.pathname !== '/posts') return;

		const target = event.target instanceof Element ? event.target.closest('[data-ac],[data-include],[data-exclude],[data-sort],[data-page],a[data-link]') : null;

		if (!target) return;

		if (target instanceof HTMLAnchorElement && target.hasAttribute('data-link')) {
			if (target.pathname !== '/posts') return;

			event.preventDefault();
			search(target.pathname + target.search);

			return;
		}

		event.preventDefault();
		if (target.hasAttribute('data-include')) return editTag(target.getAttribute('data-include') ?? '', false);
		if (target.hasAttribute('data-exclude')) return editTag(target.getAttribute('data-exclude') ?? '', true);
		if (target.hasAttribute('data-page')) return search(buildSearchUrl({ page: Number(target.getAttribute('data-page')) }));

		const sort = target.getAttribute('data-sort');

		if (sort === 'recent' || sort === 'popular') return search(buildSearchUrl({ sort }));

		const input = document.getElementById('sidebar-tag-input');
		const dropdown = document.getElementById('sidebar-autocomplete');

		if (input instanceof HTMLInputElement && target.hasAttribute('data-ac')) {
			input.value = input.value.replace(/-?[^\s]*$/, (term) => `${term.startsWith('-') ? '-' : ''}${target.getAttribute('data-ac')} `);
			input.focus();
			if (dropdown) dropdown.innerHTML = '';
		}
	});
}
