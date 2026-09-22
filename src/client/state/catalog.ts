// =========================================================================================================
// Search URLs and cursor history. Page links carry their cursor so reloads stay on the same results.
// =========================================================================================================

import { store, resetPagination, cursorForPage } from './store.js';

type SearchLocation = { tags?: string[]; sort?: 'recent' | 'popular'; page?: number };

export function buildSearchUrl({ tags, sort, page = 1 }: SearchLocation = {}): string {
	const state = store.get();
	const params = new URLSearchParams();

	for (const tag of tags ?? state.tags) params.append('tags', tag);

	if ((sort ?? state.sort) === 'popular') params.set('sort', 'popular');

	if (page > 1) {
		const cursor = cursorForPage(page) ?? (page === state.currentPage ? new URLSearchParams(location.search).get('cursor') : null);

		if (!cursor) return buildSearchUrl({ tags, sort });

		params.set('page', String(page));
		params.set('cursor', cursor);
	}

	return params.size ? `/posts?${params}` : '/posts';
}

export function readSearchUrl(): void {
	const params = new URLSearchParams(location.search);
	const terms = params.getAll('tags').flatMap((tag) => tag.split(/\s+/));
	const tags = [...new Set(terms.filter(Boolean))];
	const sort = params.get('sort') === 'popular' ? 'popular' : 'recent';
	const state = store.get();
	const requested = Number(params.get('page') ?? 1);
	let page = Number.isSafeInteger(requested) && requested > 0 ? requested : 1;

	if (state.tags.join(' ') !== tags.join(' ') || state.sort !== sort) resetPagination();

	if (page > 1 && !params.get('cursor') && !cursorForPage(page)) page = 1;

	store.set({ tags, query: tags.join(' '), sort, currentPage: page });

	if (page !== requested) history.replaceState(null, '', buildSearchUrl({ tags, sort }));
}
