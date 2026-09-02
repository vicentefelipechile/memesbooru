// =========================================================================================================
// SUB-NAV (secondary bar under header)
// Focused on publications + tags navigation. No wiki, no external sites.
// =========================================================================================================

export function renderSubNav(): string {
	return `
  <nav class="site-subnav" aria-label="Secciones">
    <a href="/" data-link>Posts</a>
    <a href="/upload" data-link>Upload</a>
    <a href="/random" data-link>Random</a>
    <a href="/favorites" data-link>Favorites</a>
  </nav>`;
}
