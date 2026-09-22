// =========================================================================================================
// Post statistics and categorized tags, using the catalog's category labels.
// =========================================================================================================

import { escapeHtml } from './search.js';
import { CATEGORY_ORDER, CATEGORY_LABELS, type SidebarTag } from './sidebar.js';

export type { SidebarTag } from './sidebar.js';

export function renderStatistics(rows: [string, string][]): string {
	return `<dl class="stat-grid">${rows.map(([key, value]) => `<dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd>`).join('')}</dl>`;
}

export function renderTagged(tags: SidebarTag[]): string {
	if (!tags.length) return '<p class="small muted">Sin tags.</p>';

	return CATEGORY_ORDER.map((category) => {
		const items = tags.filter((tag) => tag.category === category).sort((a, b) => a.name.localeCompare(b.name));

		if (!items.length) return '';

		return `<section class="sidebar-cat" data-cat="${category}"><h3>${CATEGORY_LABELS[category]}</h3><ul>${items
			.map((tag) => `<li><a href="/?tags=${encodeURIComponent(tag.name)}" data-link>${escapeHtml(tag.name.replaceAll('_', ' '))}</a> <span class="count">${tag.count}</span></li>`)
			.join('')}</ul></section>`;
	}).join('');
}
