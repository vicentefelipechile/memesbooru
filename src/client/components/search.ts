// =========================================================================================================
// SEARCH (v2)
// Compact sort controls, autocomplete links and shared escaping/number formatting.
// =========================================================================================================

export type AutocompleteTag = { name: string; display?: string | null; usage?: number };

export function renderSortLinks(sort: 'recent' | 'popular'): string {
	return `<button type="button" class="sort-btn ${sort === 'recent' ? 'on' : ''}" data-sort="recent" aria-pressed="${sort === 'recent'}">Recientes</button>
    <button type="button" class="sort-btn ${sort === 'popular' ? 'on' : ''}" data-sort="popular" aria-pressed="${sort === 'popular'}">Populares</button>`;
}

export function renderAutocomplete(items: AutocompleteTag[]): string {
	if (items.length === 0) return '';
	return `<ul>${items.map((t) => `<li><a href="/posts?tags=${encodeURIComponent(t.name)}" data-ac="${escapeAttr(t.name)}">${escapeHtml(t.display ?? t.name)}${typeof t.usage === 'number' ? ` <span class="usage">${formatCount(t.usage)}</span>` : ''}</a></li>`).join('')}</ul>`;
}

export function formatCount(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}k`;
	return String(n);
}

export function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function escapeAttr(s: string): string {
	return escapeHtml(s).replace(/'/g, '&#39;');
}
