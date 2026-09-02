// =========================================================================================================
// GRID (v2)
// Dense square thumbnail grid (no cards) + booru numeric paginator.
// =========================================================================================================

export type GridItem = { public_id: string; low_variant_key?: string | null; score: number; favorite_count: number; media_type?: string };

export function renderCard(item: GridItem): string {
	const isVideo = item.media_type === 'video' || item.media_type === 'gif';
	return `
  <a href="/post/${item.public_id}" class="thumb" data-link>
    <img loading="lazy" src="/api/posts/${item.public_id}/variants/low" alt="post ${item.public_id}" onerror="this.style.display='none'" />
    ${isVideo ? `<span class="scoreline">▶ ${item.score.toFixed(1)} · ♥ ${item.favorite_count}</span>` : ''}
  </a>`;
}

export function renderGrid(items: GridItem[]): string {
	if (items.length === 0) return `<div class="empty">No hay publicaciones. Prueba con otros tags.</div>`;
	return `<div class="posts">${items.map((c) => renderCard(c)).join('')}</div>`;
}

export function renderPaginator(current: number, total: number, hasMore: boolean, prefix = '/'): string {
	if (total <= 1 && !hasMore) return '';
	const pages = pageList(current, total, hasMore);
	const link = (page: number, label: string) => `<a href="${prefix}?page=${page}" data-page="${page}">${label}</a>`;
	const parts: string[] = [];
	if (current > 1) parts.push(link(current - 1, '« Anterior'));
	for (const p of pages) {
		if (p === null) parts.push(`<span class="ellipsis">…</span>`);
		else if (p === current) parts.push(`<span class="current">${p}</span>`);
		else parts.push(link(p, String(p)));
	}
	if (hasMore) parts.push(link(current + 1, 'Siguiente »'));
	return `<nav class="paginator" aria-label="Paginación">${parts.join('')}</nav>`;
}

// Compact page list with ellipsis around the current page.
function pageList(current: number, total: number, hasMore: boolean): (number | null)[] {
	if (total === 0) return hasMore ? [current, current + 1] : [];
	const visible = 5;
	const out: (number | null)[] = [];
	for (let p = 1; p <= total; p++) {
		if (p === 1 || p === total || Math.abs(p - current) <= 1) out.push(p);
		else if (out[out.length - 1] !== null) out.push(null);
	}
	return out;
}