// =========================================================================================================
// Public profile and authored posts.
// =========================================================================================================

import { renderGrid } from '../components/grid.js';
import { api, ApiError } from '../services/api.js';

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

function avatarMarkup(url: string | null, username: string): string {
	return url
		? `<img class="profile-avatar" src="${escapeHtml(url)}" alt="Avatar de ${escapeHtml(username)}" referrerpolicy="no-referrer">`
		: `<span class="profile-avatar profile-initial" aria-hidden="true">${escapeHtml(username.charAt(0).toUpperCase())}</span>`;
}

export async function renderProfile(username: string): Promise<string> {
	const cursor = new URL(location.href).searchParams.get('cursor') ?? undefined;
	const [result, posts] = await Promise.all([api.profiles.get(username), api.profiles.posts(username, cursor)]).catch((error: Error) => {
		if (error instanceof ApiError && error.status === 404) return [null, null] as const;
		throw error;
	});
	if (!result || !posts) return '<p class="empty">Perfil no encontrado.</p>';

	const profile = result.profile;
	const next = posts.nextCursor ? `/users/${encodeURIComponent(profile.username)}?cursor=${encodeURIComponent(posts.nextCursor)}` : null;

	return `
	<div class="profile-layout">
		<aside class="profile-side">
			${avatarMarkup(profile.avatar_url, profile.username)}
			<h1>${escapeHtml(profile.display_name || profile.username)}</h1>
			${profile.display_name && profile.display_name !== profile.username ? `<p class="profile-handle">Usuario ${escapeHtml(profile.username)}</p>` : ''}
			<p class="profile-bio">${profile.bio ? escapeHtml(profile.bio) : 'Sin biografia.'}</p>
			<dl class="profile-facts"><dt>Roles</dt><dd>${profile.roles.map(escapeHtml).join(', ')}</dd><dt>Miembro desde</dt><dd><time datetime="${new Date(profile.created_at).toISOString()}">${new Date(profile.created_at).toLocaleDateString('es-ES')}</time></dd></dl>
		</aside>
		<section class="profile-posts" aria-label="Publicaciones de ${escapeHtml(profile.username)}"><h2>Publicaciones</h2>
			${posts.data.length ? renderGrid(posts.data) : '<p class="empty">Todavia no hay publicaciones.</p>'}
			${next ? `<p class="profile-more"><a href="${escapeHtml(next)}" data-link>Ver publicaciones anteriores</a></p>` : ''}
		</section>
	</div>`;
}
