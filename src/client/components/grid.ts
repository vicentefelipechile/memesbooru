// =========================================================================================================
// GRID (v2)
// Whole-image thumbnails + booru numeric paginator with known cursor links.
// =========================================================================================================

import { escapeAttr } from './search.js';
import { apiUrl } from '../services/api.js';

export type GridItem = { public_id: string; low_variant_key?: string | null; score: number; favorite_count: number; media_type?: string };

export function renderCard(item: GridItem): string {
	const isVideo = item.media_type === 'video' || item.media_type === 'gif';

	return `
  <a href="/post/${encodeURIComponent(item.public_id)}" class="thumb" data-link>
	    <img loading="lazy" src="${apiUrl(`/api/posts/${encodeURIComponent(item.public_id)}/variants/low`)}" alt="Meme ${escapeAttr(item.public_id)}" />
    ${isVideo ? `<span class="media-label">${item.media_type === 'gif' ? 'GIF' : 'Vídeo'}</span>` : ''}
  </a>`;
}

export function renderGrid(items: GridItem[]): string {
	if (items.length === 0) return `<div class="empty">No hay publicaciones. Prueba con otros tags.</div>`;

	return `<div class="posts">${items.map((c) => renderCard(c)).join('')}</div>`;
}

export function renderPaginator(current: number, knownPages: number[], hasMore: boolean, pageUrl: (page: number) => string): string {
	if (knownPages.length <= 1 && !hasMore) return '';

	const pages = pageList(current, knownPages);
	const link = (page: number, label: string) => `<a href="${escapeAttr(pageUrl(page))}" data-page="${page}" aria-label="Página ${page}">${label}</a>`;
	const parts: string[] = [];

	if (knownPages.includes(current - 1)) parts.push(link(current - 1, '«'));

	for (const p of pages) {
		if (p === null) parts.push(`<span class="ellipsis">…</span>`);
		else if (p === current) parts.push(`<span class="current" aria-current="page">${p}</span>`);
		else parts.push(link(p, String(p)));
	}

	if (hasMore) parts.push(link(current + 1, '»'));

	return `<nav class="paginator" aria-label="Paginación">${parts.join('')}</nav>`;
}

// Compact page list with ellipsis around the current page.
function pageList(current: number, knownPages: number[]): (number | null)[] {
	const out: (number | null)[] = [];
	const visible = knownPages.filter((page) => page === 1 || page === knownPages.at(-1) || Math.abs(page - current) <= 2);

	for (const [index, page] of visible.entries()) {
		if (index > 0 && page > visible[index - 1] + 1) out.push(null);

		out.push(page);
	}

	return out;
}
