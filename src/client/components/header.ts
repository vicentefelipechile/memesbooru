export function renderHeader(user: { username: string; rank: string } | null): string {
  return `
  <header class="header">
    <a href="/" data-link class="logo">memesbooru</a>
    <nav class="nav">
      <a href="/" data-link>Inicio</a>
      <a href="/upload" data-link>Subir</a>
      ${user ? `<a href="/profile" data-link>@${user.username}</a> <span class="rank">${user.rank}</span> <button id="logout-btn">Salir</button>` : `<a href="/api/auth/google" class="login-btn">Login con Google</a>`}
    </nav>
  </header>`;
}
