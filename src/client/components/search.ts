// =========================================================================================================
// SEARCH (v2)
// Flat search bar: underline input, autocomplete as a list of text links, selected tags, sort links.
// Stable ids so the app can update results/tags/sort without re-rendering the input (keeps focus).
// =========================================================================================================

export type AutocompleteTag = { name: string; display?: string | null; usage?: number };

export function renderSearch(query: string, tags: string[], sort: 'recent' | 'popular'): string {
	return `
  <div class="search-bar" id="search-bar">
    <label class="field">
      <span class="small muted">Buscar por tags</span>
      <input id="tag-input" placeholder="pepe doge programacion..." value="${escapeHtml(query)}" autocomplete="off" />
    </label>
    <div id="autocomplete" class="autocomplete"></div>
    <div id="selected-tags" class="selected-tags">${renderSelectedTags(tags)}</div>
    <div id="sort-row" class="sort-row">${renderSortLinks(sort)}</div>
  </div>`;
}

export function renderSortLinks(sort: 'recent' | 'popular'): string {
	return `<span class="toolbar-label small muted">Orden</span>
    <button type="button" class="sort-btn ${sort === 'recent' ? 'on' : ''}" data-sort="recent">Recientes</button>
    <button type="button" class="sort-btn ${sort === 'popular' ? 'on' : ''}" data-sort="popular">Populares</button>`;
}

export function renderSelectedTags(tags: string[]): string {
	if (tags.length === 0) return '<span class="toolbar-label small muted">Tags</span><span class="small muted">—</span>';
	return `<span class="toolbar-label small muted">Tags</span>${tags
		.map(
			(t) =>
				`<span class="tag-chip"><a href="/?tags=${encodeURIComponent(t)}" data-link class="tag-name">${escapeHtml(t)}</a><button type="button" class="tag-x" data-remove="${escapeAttr(t)}" aria-label="Quitar ${t}">×</button></span>`,
		)
		.join(' ')}`;
}

export function renderAutocomplete(items: AutocompleteTag[]): string {
	if (items.length === 0) return '';
	return `<ul>${items.map((t) => `<li><a href="/?tags=${encodeURIComponent(t.name)}" data-ac="${escapeAttr(t.name)}">${escapeHtml(t.display ?? t.name)}${typeof t.usage === 'number' ? ` <span class="usage">${formatCount(t.usage)}</span>` : ''}</a></li>`).join('')}</ul>`;
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