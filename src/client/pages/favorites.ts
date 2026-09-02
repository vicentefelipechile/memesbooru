import { renderGrid, type GridItem } from '../components/grid.js';
import { getFavorites } from '../services/api.js';
import { store } from '../state/store.js';

export async function renderFavorites(): Promise<string> {
	const user = store.get().user;
	if (!user) return `<div class="empty">Necesitas entrar para ver favoritos.<div class="detail"><a href="/api/auth/google">Entrar con Google</a></div></div>`;
	const res = await getFavorites().catch<{ data: GridItem[] }>(() => ({ data: [] }));
	return `<div class="page-head"><h1>Favoritos</h1></div>${renderGrid(res.data)}`;
}

export function bindFavorites(): void {}