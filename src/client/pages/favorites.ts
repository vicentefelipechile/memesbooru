import { renderGrid, type GridItem } from '../components/grid.js';
import { api, loginUrl } from '../services/api.js';
import { store } from '../state/store.js';

export async function renderFavorites(cursor?: string): Promise<string> {
	const user = store.get().user;
	if (!user) return `<div class="empty">Necesitas entrar para ver favoritos.<div class="detail"><a href="${loginUrl()}">Entrar con Google</a></div></div>`;
	const res = await api.favorites.list(cursor).catch<{ data: GridItem[]; nextCursor?: string | null }>(() => ({ data: [] }));
	const next = res.nextCursor ? `<p class="pagination"><a href="/favorites?cursor=${encodeURIComponent(res.nextCursor)}" data-link>Siguiente »</a></p>` : '';
	return `<div class="page-head"><h1>Favoritos</h1></div>${renderGrid(res.data)}${next}`;
}

export function bindFavorites(): void {}
