// =========================================================================================================
// HEADER (v2)
// Flat booru nav: brand + text links. No pills, no gradients.
// =========================================================================================================

import { renderSubNav } from './sub-nav.js';
import { escapeHtml } from './search.js';

function renderTodo(label: string): string {
	return `<span class="nav-todo" aria-disabled="true" title="Pendiente de implementar">${label} <small>TODO</small></span>`;
}

export function renderHeader(user: { username: string; rank: string } | null): string {
	return `
   <a href="#page" class="skip-link">Saltar al contenido</a>
  <header class="site-header">
     <a href="/" data-link class="brand">Memesbooru</a>
    <nav class="site-nav" aria-label="Principal">
       <a href="${user ? '/profile' : '/api/auth/google'}" ${user ? 'data-link' : ''}>Mi cuenta</a>
       <a href="/posts" data-link>Posts</a>
       ${['Comentarios', 'Wiki', 'Alias', 'Artistas', 'Tags', 'Pools', 'Foro', 'Top', 'Ayuda'].map(renderTodo).join('')}
      ${
				user
					? `<a href="/profile" data-link>@${escapeHtml(user.username)}</a>
         <button id="logout-btn" class="small">Salir</button>`
					: ''
			}
    </nav>
  </header>
  ${renderSubNav()}`;
}
