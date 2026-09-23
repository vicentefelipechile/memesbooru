// =========================================================================================================
// SUB-NAV (secondary bar under header)
// Shared contextual links for the public shell.
// =========================================================================================================

export function renderSubNav(): string {
	return `
  <nav class="site-subnav" aria-label="Secciones">
     <a href="/upload" data-link>Subir</a>
      <a href="/upload/video" data-link>Subir vídeo</a>
     <a href="/random" data-link>Aleatorio</a>
     <a href="/favorites" data-link>Favoritos</a>
     <a href="/settings" data-link>Configuración</a>
      <a href="/contact" data-link>Contacto</a>
      <a href="/about" data-link>Acerca de</a>
      <a href="/dmca" data-link>DMCA</a>
      <a href="/tos" data-link>TOS</a>
  </nav>`;
}
