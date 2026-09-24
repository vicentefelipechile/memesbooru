// =========================================================================================================
// Reusable tag input: suggestions complete the last term without submitting the form.
// =========================================================================================================

import { api } from '../services/api.js';
import { sanitizeMarkup } from './sanitize.js';
import { escapeAttr, escapeHtml, formatCount } from './search.js';

type AutocompleteTag = { name: string; display?: string | null; usage?: number };

function renderSuggestions(items: AutocompleteTag[]): string {
	if (!items.length) return '';

	return `<ul>${items.map((tag) => `<li><a href="/posts?tags=${encodeURIComponent(tag.name)}" data-ac="${escapeAttr(tag.name)}">${escapeHtml(tag.display ?? tag.name)}${typeof tag.usage === 'number' ? ` <span class="usage">${formatCount(tag.usage)}</span>` : ''}</a></li>`).join('')}</ul>`;
}

export function renderTagAutocompleteField(input: string): string {
	return `<div class="tag-autocomplete">${input}<div class="tag-autocomplete-list"></div></div>`;
}

export function completeTag(value: string, name: string): string {
	return value.replace(/-?[^\s]*$/, (term) => `${term.startsWith('-') ? '-' : ''}${name} `);
}

export function bindTagAutocomplete(input: HTMLInputElement): () => void {
	const dropdown = input.parentElement?.querySelector('.tag-autocomplete-list');
	const singleTag = input.hasAttribute('data-single-tag');
	let timer: number | undefined;
	let version = 0;

	function clear(): void {
		clearTimeout(timer);
		version++;
		if (dropdown) dropdown.innerHTML = '';
	}

	input.addEventListener('input', () => {
		clear();
		const current = version;
		const value = input.value;
		const term = singleTag ? value.trim() : (value.split(/\s+/).pop()?.replace(/^-/, '') ?? '');

		if (!term) return;

		timer = window.setTimeout(async () => {
			try {
				const result = await api.tags.autocomplete(term);

				if (current === version && input.isConnected && input.value === value && dropdown) dropdown.innerHTML = sanitizeMarkup(renderSuggestions(result.tags));
			} catch (error) {
				console.error('Autocomplete failed', error);
			}
		}, 200);
	});

	input.addEventListener('keydown', (event) => {
		if (event.key === 'Escape') clear();
		if (event.key === 'ArrowDown') {
			event.preventDefault();
			dropdown?.querySelector('a')?.focus();
		}
	});

	dropdown?.addEventListener('click', (event) => {
		const target = event.target instanceof Element ? event.target.closest<HTMLAnchorElement>('a[data-ac]') : null;

		if (!target) return;

		event.preventDefault();
		input.value = singleTag ? (target.dataset.ac ?? '') : completeTag(input.value, target.dataset.ac ?? '');
		clear();
		input.focus();
	});

	return clear;
}
