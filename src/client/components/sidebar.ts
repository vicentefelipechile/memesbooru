// =========================================================================================================
// SIDEBAR (booru style)
// Categorized tag browser for home page. Matches Rule34 left column.
// =========================================================================================================

import { formatCount, escapeHtml, escapeAttr } from './search.js';

export type SidebarTag = { name: string; display?: string | null; usage?: number };

export const CATEGORY_ORDER = ['reaction', 'source', 'people', 'character', 'meta'] as const;
export const CATEGORY_LABELS: Record<string, string> = {
	reaction: 'Reaction',
	source: 'Source',
	people: 'People',
	character: 'Character',
	meta: 'Meta',
};

export function renderSidebar(groups: Record<string, SidebarTag[]>): string {
	const cats = CATEGORY_ORDER.filter((c) => (groups[c] ?? []).length > 0 || true); // show all even empty
	return `
  <div class="sidebar">
    <div class="sidebar-search">
      <label class="small muted">Search</label>
      <input id="sidebar-tag-input" placeholder="safe_for_work" autocomplete="off" />
      <div id="sidebar-autocomplete" class="sidebar-autocomplete"></div>
      <div class="pool-filter">
        <label><input type="checkbox" disabled /> Filter pools</label>
        <span class="tiny">próximamente</span>
      </div>
    </div>
    ${cats
			.map((cat) => {
				const list = groups[cat] ?? [];
				const items = list
					.map(
						(t) =>
							`<a href="/?tags=${encodeURIComponent(t.name)}" data-link data-ac="${escapeAttr(t.name)}">${escapeHtml(t.display ?? t.name)} ${typeof t.usage === 'number' ? `<span class="count">${formatCount(t.usage)}</span>` : ''}</a>`,
					)
					.join('');
				return `<details class="sidebar-cat" data-cat="${cat}" open>
          <summary>${CATEGORY_LABELS[cat] ?? cat}</summary>
          <div class="tag-links">${items || '<span class="tiny">sin tags</span>'}</div>
        </details>`;
			})
			.join('')}
  </div>`;
}
