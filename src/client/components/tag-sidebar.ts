// =========================================================================================================
// TAG SIDEBAR (v2)
// Booru detail sidebar: Statistics + Tagged (tags grouped by category, with usage counts).
// =========================================================================================================

import { formatCount } from './search.js';

export type SidebarTag = { name: string; category: string; count: number };

const CATEGORY_LABELS: Record<string, string> = {
	general: 'General',
	artist: 'Artista',
	character: 'Personaje',
	series: 'Serie',
	copyright: 'Copyright',
	meta: 'Meta',
};

export function renderStatistics(rows: [string, string][]): string {
	if (rows.length === 0) return '';
	return `<dl class="stat-grid">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>`;
}

export function renderTagged(tags: SidebarTag[]): string {
	if (tags.length === 0) return '<p class="small muted">Sin tags.</p>';
	const groups = new Map<string, SidebarTag[]>();
	for (const t of tags) {
		const arr = groups.get(t.category) ?? [];
		arr.push(t);
		groups.set(t.category, arr);
	}
	return [...groups.entries()]
		.map(
			([cat, list]) => `<div class="tag-category">
      <span class="cat">${CATEGORY_LABELS[cat] ?? cat}</span>
      <div class="tag-list">${list.map((t) => `<a href="/?tags=${encodeURIComponent(t.name)}" data-link>${t.name}</a> <span class="count">${formatCount(t.count)}</span>`).join(' ')}</div>
    </div>`,
		)
		.join('');
}

export function renderSideBlock(title: string, inner: string): string {
	return `<section class="side-block"><h2>${title}</h2>${inner}</section>`;
}