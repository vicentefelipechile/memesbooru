// =========================================================================================================
// HEADER (v2)
// Flat booru nav: brand + text links. No pills, no gradients.
// =========================================================================================================

import { renderSubNav } from './sub-nav.js';
import { escapeHtml } from './search.js';

export function renderHeader(user: { username: string; rank: string } | null): string {
	return `
   <a href="#page" class="skip-link">Saltar al contenido</a>
  <header class="site-header">
     <a href="/" data-link class="brand">Memesbooru</a>
    <nav class="site-nav" aria-label="Principal">
        <a href="${user ? '/account' : '/login'}" data-link>Mi cuenta</a>
       <a href="/posts" data-link>Posts</a>
       <a href="/comments" data-link>Comentarios</a>
       <a href="/wiki" data-link>Wiki</a>
       <a href="/aliases" data-link>Aliases</a>
       <a href="/artists" data-link>Artists</a>
       <a href="/tags" data-link>Tags</a>
       <a href="/pools" data-link>Pools</a>
       <a href="/forum" data-link>Forum</a>
       <a href="/top" data-link>Top 100</a>
       <a href="/help" data-link>Help</a>
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
