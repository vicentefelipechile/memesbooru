// =========================================================================================================
// Search and contextual tags for the visible page.
// =========================================================================================================

import { escapeHtml, escapeAttr, renderSortLinks } from './search.js';

export const CATEGORY_ORDER = ['reaction', 'source', 'people', 'character', 'meta'] as const;
export const CATEGORY_LABELS: Record<string, string> = {
	reaction: 'Reacciones',
	source: 'Fuentes',
	people: 'Personas',
	character: 'Personajes',
	meta: 'Meta',
};

export type SidebarTag = { name: string; category: string; count: number };

export function renderPageTags(tags: SidebarTag[]): string {
	if (!tags.length) return '<p class="tiny">Sin tags en esta página.</p>';

	return CATEGORY_ORDER.map((category) => {
		const items = tags.filter((tag) => tag.category === category).sort((a, b) => a.name.localeCompare(b.name));

		if (!items.length) return '';

		return `<section class="sidebar-cat" data-cat="${category}"><h3>${CATEGORY_LABELS[category]}</h3>
			<ul>${items
				.map(
					(tag) => `<li>
				<span class="tag-help" aria-disabled="true" title="Información del tag: TODO">?</span>
				<button type="button" data-include="${escapeAttr(tag.name)}" aria-label="Añadir ${escapeAttr(tag.name)}">+</button>
				<button type="button" data-exclude="${escapeAttr(tag.name)}" aria-label="Excluir ${escapeAttr(tag.name)}">−</button>
				<a href="/?tags=${encodeURIComponent(tag.name)}" data-link>${escapeHtml(tag.name.replaceAll('_', ' '))}</a>
				<span class="count" title="Publicaciones en todo el catálogo">${tag.count}</span>
			</li>`,
				)
				.join('')}</ul></section>`;
	}).join('');
}

export function renderSidebar(tags: SidebarTag[], query: string, sort: 'recent' | 'popular'): string {
	return `<div class="sidebar">
		<form id="sidebar-search" class="sidebar-search" action="/" role="search">
			<label for="sidebar-tag-input">Buscar</label>
			<input id="sidebar-tag-input" name="tags" value="${escapeAttr(query)}" maxlength="500" autocomplete="off" aria-describedby="search-hint" />
			<button type="submit">Buscar</button>
			<div id="sidebar-autocomplete" class="sidebar-autocomplete"></div>
			<span id="search-hint" class="tiny">tag otro_tag -excluir</span>
		</form>
		<div id="sort-row" class="sort-row">${renderSortLinks(sort)}</div>
		<details class="page-tags" open><summary>Tags</summary><div id="page-tags">${renderPageTags(tags)}</div></details>
	</div>`;
}
