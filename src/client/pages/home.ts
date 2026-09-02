import { renderSearch, renderAutocomplete, renderSelectedTags, renderSortLinks } from '../components/search.js';
import { renderGrid, renderPaginator, type GridItem } from '../components/grid.js';
import { store, resetPagination, cursorForPage, recordPage, setCurrentPage, setHasMore } from '../state/store.js';
import { searchPosts, autocompleteTags } from '../services/api.js';

type SearchResult = { data: GridItem[]; nextCursor: string | null; hasMore?: boolean };

// =========================================================================================================
// Render — only the main content (header lives in the persistent shell).
// =========================================================================================================

export async function renderHome(): Promise<string> {
	parseUrlIntoStore();
	const page = store.get().currentPage;
	const result = await fetchPage(page);
	return `
    <div class="page-head"><h1>Memesbooru</h1></div>
    ${renderSearch(store.get().query, store.get().tags, store.get().sort)}
    <div id="results">
      ${renderGrid(result.data)}
      ${renderPaginatorFor(page, result)}
    </div>
    <div id="status" class="status-line" aria-live="polite"></div>
  `;
}

export function bindHome(): void {
	const input = document.getElementById('tag-input');
	if (!(input instanceof HTMLInputElement)) return;
	let t: number | undefined;
	input.addEventListener('input', () => {
		store.set({ query: input.value });
		clearTimeout(t);
		t = window.setTimeout(async () => {
			const q = input.value.trim().split(/\s+/).pop() ?? '';
			if (!q) return;
			const ac = await autocompleteTags(q).catch(() => ({ tags: [] }));
			const el = document.getElementById('autocomplete');
			if (el) el.innerHTML = ac.tags.length ? renderAutocomplete(ac.tags) : '';
		}, 200);
	});
	input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter') {
			const parts = input.value.trim().split(/\s+/).filter(Boolean);
			if (!parts.length) return;
			navigateTo(buildUrl({ tags: parts }));
			void loadResults();
		}
	});
}

// =========================================================================================================
// Global delegation (bound once in the router). Keeps search bar stable; only #results re-renders.
// =========================================================================================================

export function bindHomeGlobal(): void {
	document.addEventListener('click', (e) => {
		if (e.defaultPrevented) return;
		const target = (e.target as Element | null)?.closest?.('[data-ac],[data-remove],[data-sort],[data-page]');
		if (!target) return;
		e.preventDefault();
		if (target.hasAttribute('data-ac')) return handleAddTag(target.getAttribute('data-ac') ?? '');
		if (target.hasAttribute('data-remove')) return handleRemoveTag(target.getAttribute('data-remove') ?? '');
		if (target.hasAttribute('data-sort')) return handleSort(target.getAttribute('data-sort') ?? 'recent');
		if (target.hasAttribute('data-page')) return handlePage(parseInt(target.getAttribute('data-page') ?? '1', 10) || 1);
	});
}

function handleAddTag(tag: string): void {
	if (!tag) return;
	const s = store.get();
	navigateTo(buildUrl({ tags: [...new Set([...s.tags, tag])] }));
	void loadResults();
}

function handleRemoveTag(tag: string): void {
	const s = store.get();
	navigateTo(buildUrl({ tags: s.tags.filter((t) => t !== tag) }));
	void loadResults();
}

function handleSort(sort: string): void {
	if (sort !== 'recent' && sort !== 'popular') return;
	const s = store.get();
	if (sort === s.sort) return;
	navigateTo(buildUrl({ sort }));
	void loadResults();
}

function handlePage(page: number): void {
	navigateTo(buildUrl({ page }));
	void loadResults();
}

// =========================================================================================================
// Data loading — fetch a page and update only the results/tags/sort, preserving the search input.
// =========================================================================================================

async function loadResults(): Promise<void> {
	parseUrlIntoStore();
	const page = store.get().currentPage;
	const result = await fetchPage(page);
	updateDom(page, result);
}

async function fetchPage(page: number): Promise<SearchResult> {
	const s = store.get();
	const cursor = cursorForPage(page) ?? undefined;
	const result = await searchPosts({ tags: s.tags.join(' '), sort: s.sort, cursor, limit: 24 }).catch<SearchResult>(() => ({ data: [], nextCursor: null, hasMore: false }));
	recordPage(result.nextCursor);
	setHasMore(result.hasMore ?? !!result.nextCursor);
	setCurrentPage(page);
	return result;
}

function updateDom(page: number, result: SearchResult): void {
	const s = store.get();
	const input = document.getElementById('tag-input');
	if (input instanceof HTMLInputElement) input.value = s.query;
	const autocomplete = document.getElementById('autocomplete');
	if (autocomplete) autocomplete.innerHTML = '';
	const tagsEl = document.getElementById('selected-tags');
	if (tagsEl) tagsEl.innerHTML = renderSelectedTags(s.tags);
	const sortEl = document.getElementById('sort-row');
	if (sortEl) sortEl.innerHTML = renderSortLinks(s.sort);
	const results = document.getElementById('results');
	if (results) results.innerHTML = renderGrid(result.data) + renderPaginatorFor(page, result);
}

function renderPaginatorFor(page: number, result: SearchResult): string {
	const hasNext = result.hasMore ?? !!result.nextCursor;
	return renderPaginator(page, hasNext ? page + 1 : page, hasNext);
}

// =========================================================================================================
// URL <-> store
// =========================================================================================================

function buildUrl({ tags, sort, page }: { tags?: string[]; sort?: 'recent' | 'popular'; page?: number }): string {
	const s = store.get();
	const t = tags ?? s.tags;
	const so = sort ?? s.sort;
	const p = page ?? 1;
	const params = new URLSearchParams();
	if (t.length) params.set('tags', t.join(' '));
	if (so === 'popular') params.set('sort', so);
	if (p > 1) params.set('page', String(p));
	const qs = params.toString();
	return qs ? `/?${qs}` : '/';
}

function navigateTo(path: string): void {
	history.pushState(null, '', path);
}

function parseUrlIntoStore(): void {
	const sp = new URLSearchParams(location.search);
	const tags = (sp.get('tags') ?? '').split(/\s+/).filter(Boolean);
	const sort = sp.get('sort') === 'popular' ? 'popular' : 'recent';
	const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10) || 1);
	const s = store.get();
	if (s.tags.join(' ') !== tags.join(' ') || s.sort !== sort) {
		resetPagination();
		store.set({ tags, sort, query: tags.join(' ') });
	} else if (s.currentPage !== page) {
		store.set({ currentPage: page });
	}
}