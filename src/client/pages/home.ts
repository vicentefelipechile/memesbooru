import { renderHeader } from '../components/header.js';
import { renderSearch } from '../components/search.js';
import { renderGrid, renderCursor } from '../components/grid.js';
import { store } from '../state/store.js';
import { searchPosts, autocompleteTags, getMe } from '../services/api.js';

export async function renderHome(): Promise<string> {
	const s = store.get();
	const { user } = await getMe().catch(() => ({ user: null }));
	const { data, nextCursor } = await searchPosts({ tags: s.tags.join(' '), sort: s.sort, limit: 20 }).catch(() => ({ data: [], nextCursor: null }));
	return `
    ${renderHeader(user)}
    <main class="page">
      ${renderSearch(s.query, s.tags)}
      ${renderGrid(data)}
      ${renderCursor(nextCursor)}
      <div id="status"></div>
    </main>
  `;
}

export function bindHome(): void {
	const maybeInput = document.getElementById('tag-input');
	const input = maybeInput instanceof HTMLInputElement ? maybeInput : null;
	if (input) {
		let t: number | undefined;
		input.addEventListener('input', () => {
			store.set({ query: input.value });
			clearTimeout(t);
			t = window.setTimeout(async () => {
				const q = input.value.trim().split(/\s+/).pop() ?? '';
				if (!q) return;
				const ac = await autocompleteTags(q).catch(() => ({ tags: [] }));
				const el = document.getElementById('autocomplete');
				if (el) el.innerHTML = ac.tags.map((x) => `<button data-ac="${x.name}">${x.name}</button>`).join('');
			}, 200);
		});
		input.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				const parts = input.value.trim().split(/\s+/).filter(Boolean);
				if (parts.length) {
					store.set({ tags: parts });
					history.pushState(null, '', `/?tags=${encodeURIComponent(parts.join(' '))}`);
					window.dispatchEvent(new PopStateEvent('popstate'));
				}
			}
		});
	}
	document.querySelectorAll('[data-ac]').forEach((el) => {
		if (!(el instanceof HTMLElement)) return;
		el.addEventListener('click', () => {
			const v = el.dataset.ac;
			if (!v) return;
			const s = store.get();
			const next = [...s.tags, v];
			store.set({ tags: next, query: next.join(' ') });
		});
	});
	const loadMoreBtn = document.getElementById('load-more');
	if (loadMoreBtn instanceof HTMLButtonElement) {
		loadMoreBtn.addEventListener('click', async () => {
			const cursor = loadMoreBtn.dataset.cursor;
			if (!cursor) return;
			const s = store.get();
			const { data, nextCursor } = await searchPosts({ tags: s.tags.join(' '), sort: s.sort, cursor, limit: 20 });
			const grid = document.querySelector('.grid');
			if (grid) grid.insertAdjacentHTML('beforeend', renderGrid(data));
			loadMoreBtn.dataset.cursor = nextCursor ?? '';
			if (!nextCursor) loadMoreBtn.remove();
		});
	}
	document.querySelectorAll('[data-sort]').forEach((el) => {
		if (!(el instanceof HTMLElement)) return;
		el.addEventListener('click', () => {
			const sort = el.dataset.sort;
			if (sort !== 'recent' && sort !== 'popular') return;
			store.set({ sort });
			window.dispatchEvent(new PopStateEvent('popstate'));
		});
	});
	document.getElementById('logout-btn')?.addEventListener('click', async () => {
		await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
		location.reload();
	});
}
