// =========================================================================================================
// LANDING
// Focused entry point: explain the catalog and put the tag search first.
// =========================================================================================================

import { navigate } from '../app/router.js';

export function renderLanding(): string {
	return `<section class="landing" aria-labelledby="landing-title">
		<div class="landing-mark" aria-hidden="true">MB</div>
		<h1 id="landing-title">Memesbooru</h1>
		<p class="landing-lead">Encuentra el meme que buscas.</p>
		<p class="landing-copy">Busca por etiquetas, combina temas y explora una biblioteca de memes hecha para encontrar posts rápido.</p>
		<form id="landing-search" class="landing-search">
			<label for="landing-tag-input">Buscar memes</label>
			<div class="landing-search-row">
				<input id="landing-tag-input" name="tags" type="search" placeholder="wojak pepe reaction" autocomplete="off" />
				<button type="submit" class="primary">Buscar</button>
			</div>
			<p class="landing-hint">Separa las etiquetas con espacios. Usa <code>-</code> para excluir una etiqueta.</p>
		</form>
		<nav class="landing-links" aria-label="Accesos rápidos">
			<a href="/posts" data-link>Ver publicaciones recientes</a>
			<a href="/posts?sort=popular" data-link>Ver las más populares</a>
		</nav>
	</section>`;
}

export function bindLanding(): void {
	const form = document.getElementById('landing-search');
	const input = document.getElementById('landing-tag-input');

	if (!(form instanceof HTMLFormElement) || !(input instanceof HTMLInputElement)) return;

	form.addEventListener('submit', (event) => {
		event.preventDefault();
		const tags = input.value.trim().split(/\s+/).filter(Boolean);
		const params = new URLSearchParams();

		for (const tag of tags) params.append('tags', tag);

		navigate(`/posts${params.size ? `?${params}` : ''}`);
	});
}
