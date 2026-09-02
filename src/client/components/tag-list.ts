export function renderTagList(tags: string[]): string {
	if (tags.length === 0) return '';
	return `<div class="tags">${tags.map((t) => `<a href="/?tags=${t}" data-link>#${t}</a>`).join(' ')}</div>`;
}

export function renderSelectedTags(tags: string[]): string {
	return `<div class="selected-tags">${tags.map((t) => `<span class="tag">${t} <button data-remove="${t}">x</button></span>`).join('')}</div>`;
}
