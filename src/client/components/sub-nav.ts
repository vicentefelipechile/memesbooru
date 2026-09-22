// =========================================================================================================
// SUB-NAV (secondary bar under header)
// Focused on publications + tags navigation. No wiki, no external sites.
// =========================================================================================================

export function renderSubNav(): string {
	return `
  <nav class="site-subnav" aria-label="Secciones">
     <a href="/upload" data-link>Subir</a>
     <span class="nav-todo" aria-disabled="true">Subir vídeo <small>TODO</small></span>
     <a href="/random" data-link>Aleatorio</a>
     <a href="/favorites" data-link>Favoritos</a>
     <a href="/settings" data-link>Configuración</a>
     <span class="nav-todo" aria-disabled="true">Contacto <small>TODO</small></span>
     <span class="nav-todo" aria-disabled="true">Acerca de <small>TODO</small></span>
  </nav>`;
}
