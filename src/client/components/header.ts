// =========================================================================================================
// HEADER (v2)
// Flat booru nav: brand + text links. No pills, no gradients.
// =========================================================================================================

export function renderHeader(user: { username: string; rank: string } | null): string {
	return `
  <a href="#contenido" class="skip-link">Saltar al contenido</a>
  <header class="site-header">
    <a href="/" data-link class="brand">memes<span class="brand-accent">booru</span></a>
    <nav class="site-nav" aria-label="Principal">
      <a href="/" data-link>Inicio</a>
      <a href="/upload" data-link>Subir</a>
      ${
				user
					? `<a href="/favorites" data-link>Favoritos</a>
         <a href="/profile" data-link>@${user.username}</a>
         <span class="rank">${user.rank}</span>
         <button id="logout-btn" class="small">Salir</button>`
					: `<a href="/api/auth/google">Entrar con Google</a>`
			}
    </nav>
  </header>`;
}