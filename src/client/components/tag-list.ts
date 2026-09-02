// =========================================================================================================
// TAG LIST (v2)
// Plain-text tag links. Simple flat list for the grid context.
// =========================================================================================================

export type TagItem = { name: string; category: string; count: number };

export function renderTagList(tags: TagItem[]): string {
	if (tags.length === 0) return '';
	return `<div class="tag-list">${tags.map((t) => `<a href="/?tags=${encodeURIComponent(t.name)}" data-link>${t.name}</a>`).join(' ')}</div>`;
}