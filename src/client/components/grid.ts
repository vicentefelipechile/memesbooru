import { renderScore } from './score';

export type GridItem = { public_id: string; low_variant_key?: string | null; score: number; favorite_count: number; tags?: string[] };

export function renderCard(item: GridItem): string {
	return `
      <a href="/post/${item.public_id}" data-link class="card">
        <div class="thumb" style="background:#1a1a1a">
          <img loading="lazy" src="/api/posts/${item.public_id}/variants/low" alt="${(item.tags ?? []).join(' ')}" onerror="this.style.display='none'" />
        </div>
        ${renderScore(item.score, item.favorite_count)}
      </a>`;
}

export function renderGrid(items: GridItem[]): string {
	if (items.length === 0) return `<div class="empty">No hay publicaciones. Prueba otros tags.</div>`;
	return `<div class="grid">${items.map((p) => renderCard(p)).join('')}</div>`;
}
export function renderCursor(nextCursor: string | null): string {
	return nextCursor ? `<button id="load-more" data-cursor="${nextCursor}" class="load-more">Cargar mas</button>` : `<span class="end">Fin</span>`;
}
