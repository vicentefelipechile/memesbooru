import { api, apiUrl } from '../services/api.js';
import { renderScore } from '../components/score.js';
import { renderCommentList, renderCommentForm, formatDate } from '../components/comment.js';
import { renderStatistics, renderTagged, type SidebarTag } from '../components/tag-sidebar.js';
import { escapeAttr, formatCount } from '../components/search.js';
import { sanitizeMarkup } from '../components/sanitize.js';
import { store } from '../state/store.js';

type PostDetail = {
	title?: string | null;
	description?: string | null;
	score?: number;
	rating_count?: number;
	favorite_count?: number;
	comment_count?: number;
	tags?: SidebarTag[];
	author_username?: string | null;
	media_type?: string;
	published_at?: number;
	post_id?: number;
	restricted?: boolean;
	redirectTo?: string;
};

// =========================================================================================================
// Render
// =========================================================================================================

export async function renderPost(publicId: string): Promise<string> {
	const data = await api.posts.get(publicId).catch(() => null);

	if (!data) return `<div class="error">Post no encontrado<div class="detail"><a href="/posts" data-link>Volver a publicaciones</a></div></div>`;

	if (data.redirectTo) {
		history.pushState(null, '', `/post/${data.redirectTo}`);
		window.dispatchEvent(new PopStateEvent('popstate'));

		return '';
	}

	const user = store.get().user;
	const restricted = data.restricted === true;
	const canEditTags = user && (user.id === data.author_id || user.permissions?.includes('edit_tags'));

	return `
    <div class="post-layout">
      <aside class="post-side">
        <section class="side-block"><h2>Estadísticas</h2><div id="stats">${renderStatistics(buildStatistics(data))}</div></section>
		 <section class="side-block"><h2>Tags</h2><div id="post-tags">${renderTagged(data.tags ?? [])}</div>${canEditTags ? `<button id="edit-post-tags" type="button">Editar tags</button><form id="post-tags-form" class="form-stack" hidden><label>Tags separados por espacios<input name="tags" value="${escapeAttr((data.tags ?? []).map((tag) => tag.name).join(' '))}" required></label><button type="submit">Guardar</button><p role="status" aria-live="polite"></p></form>` : ''}</section>
      </aside>
      <section class="post-main">
        <div class="post-media">
		  ${restricted ? `<p class="restricted">No tienes permiso para ver este video.</p>` : data.media_type === 'video' ? '<div id="video-player"></div>' : `<img src="${apiUrl(`/api/posts/${encodeURIComponent(publicId)}/variants/medium`)}" alt="post ${publicId}" loading="eager" />`}
        </div>
        <h1 class="post-title">${data.title ? escapeHtml(data.title) : `Post ${publicId}`}</h1>
        ${data.author_username ? `<p>Publicado por <a href="/users/${encodeURIComponent(data.author_username)}" data-link>${escapeHtml(data.author_username)}</a></p>` : ''}
        <div class="post-actions">
          <span id="score-line">${renderScore(data.score ?? 0, data.favorite_count ?? 0, data.comment_count ?? 0)}</span>
          <button id="vote-up">+1</button>
          <button id="vote-down">−1</button>
          <button id="fav-btn">Favorito</button>
          <button id="report-btn">Reportar</button>
        </div>
        <a href="${apiUrl(`/api/posts/${encodeURIComponent(publicId)}/variants/original`)}" target="_blank" rel="noopener" class="button small">Ver original</a>
        ${data.description ? `<div class="post-description">${escapeHtml(data.description)}</div>` : ''}
    <section id="comments" class="comments">
      <h2>Comentarios</h2>
      <div id="comments-list"><p class="none">Cargando...</p></div>
      ${user ? renderCommentForm() : '<p class="none small">Inicia sesión para comentar.</p>'}
    </section>
      </section>
    </div>
  `;
}

// =========================================================================================================
// Bind — in-place updates, no page reload.
// =========================================================================================================

export function bindPost(publicId: string): void {
	const player = document.getElementById('video-player');

	if (player) {
		const iframe = document.createElement('iframe');
		iframe.src = apiUrl(`/api/posts/${encodeURIComponent(publicId)}/variants/medium`);
		iframe.title = `Vídeo ${publicId}`;
		iframe.allow = 'accelerometer; autoplay; encrypted-media; picture-in-picture';
		iframe.allowFullscreen = true;
		player.replaceWith(iframe);
	}

	const q = (s: string) => {
		const el = document.querySelector(s);

		return el instanceof HTMLElement ? el : null;
	};

	let faved = false;
	void api.posts.get(publicId).then((post) => {
		const report = document.getElementById('report-btn');
		if (report instanceof HTMLButtonElement && post.post_id) report.dataset.postId = String(post.post_id);
	});

	q('#vote-up')?.addEventListener('click', () => void rate(publicId, 1));
	q('#vote-down')?.addEventListener('click', () => void rate(publicId, -1));

	q('#fav-btn')?.addEventListener('click', async () => {
		const result = faved ? api.posts.unfavorite(publicId) : api.posts.favorite(publicId);

		if (!(await result.catch(() => null))) return;

		faved = !faved;

		const btn = q('#fav-btn');

		if (btn instanceof HTMLButtonElement) btn.textContent = faved ? 'Favorito ✓' : 'Favorito';

		await refreshPost(publicId);
	});

	q('#report-btn')?.addEventListener('click', () => {
		const reason = prompt('Motivo del reporte:');

		if (!reason) return;

		const targetId = Number((document.getElementById('report-btn') as HTMLButtonElement | null)?.dataset.postId ?? 0);
		if (!targetId) return;
		api.moderation
			.report({ target_type: 'post', target_id: targetId, reason })
			.then(() => alert('Reportado'))
			.catch(() => alert('No se pudo reportar'));
	});
	q('#edit-post-tags')?.addEventListener('click', () => {
		const form = document.getElementById('post-tags-form');
		if (form instanceof HTMLFormElement) form.hidden = !form.hidden;
	});
	const tagsForm = document.getElementById('post-tags-form');
	tagsForm?.addEventListener('submit', async (event) => {
		event.preventDefault();
		if (!(tagsForm instanceof HTMLFormElement)) return;
		const input = tagsForm.querySelector<HTMLInputElement>('[name="tags"]');
		const status = tagsForm.querySelector('p[role="status"]');
		if (!input || !status) return;
		try {
			await api.posts.setTags(publicId, input.value.trim().split(/\s+/).filter(Boolean));
			const post = await api.posts.get(publicId, true);
			const tags = document.getElementById('post-tags');
			if (tags) tags.innerHTML = sanitizeMarkup(renderTagged(post.tags ?? []));
			input.value = (post.tags ?? []).map((tag) => tag.name).join(' ');
			status.textContent = 'Tags guardados.';
		} catch (error) {
			status.textContent = error instanceof Error ? error.message : 'No se pudieron guardar los tags.';
		}
	});

	bindCommentForm(publicId);
	loadComments(publicId);
}

async function rate(publicId: string, value: number): Promise<void> {
	const result = await api.posts.rate(publicId, value).catch(() => null);

	if (result) await refreshPost(publicId);
}

// Refetch the post and update score + statistics in place.
async function refreshPost(publicId: string): Promise<void> {
	const data = await api.posts.get(publicId).catch(() => null);

	if (!data) return;

	const scoreLine = document.getElementById('score-line');

	if (scoreLine) scoreLine.innerHTML = sanitizeMarkup(renderScore(data.score ?? 0, data.favorite_count ?? 0, data.comment_count ?? 0));

	const stats = document.getElementById('stats');

	if (stats) stats.innerHTML = sanitizeMarkup(renderStatistics(buildStatistics(data)));
}

// Append the new comment to the list without reloading.
function bindCommentForm(publicId: string): void {
	const form = document.getElementById('comment-form');

	if (!(form instanceof HTMLFormElement)) return;

	form.addEventListener('submit', async (e) => {
		e.preventDefault();

		const bodyEl = document.getElementById('c-body');

		if (!(bodyEl instanceof HTMLTextAreaElement)) return;

		const body = bodyEl.value.trim();

		if (!body) return;

		const result = await api.comments.create(publicId, { body }).catch(() => null);

		if (!result) return;

		const user = store.get().user;
		const author = user?.username ?? '';
		const list = document.getElementById('comments-list');

		if (list) {
			list.insertAdjacentHTML(
				'beforeend',
				sanitizeMarkup(`<article class="comment"><div class="byline"><span class="author">${escapeHtml(author)}</span> · ${formatDate(Date.now())}</div><div class="body">${escapeHtml(body)}</div></article>`),
			);

			const none = list.querySelector('.none');

			if (none) none.remove();
		}

		bodyEl.value = '';
	});
}

// =========================================================================================================
// Comments loader
// =========================================================================================================

function loadComments(publicId: string): void {
	api.comments
		.list(publicId)
		.then((res) => {
			const list = document.getElementById('comments-list');

			if (list) list.innerHTML = sanitizeMarkup(renderCommentList(res.data));
		})
		.catch(() => {
			const list = document.getElementById('comments-list');

			if (list) list.innerHTML = '<p class="none">No se pudieron cargar.</p>';
		});
}

// =========================================================================================================
// Helpers
// =========================================================================================================

function buildStatistics(data: PostDetail): [string, string][] {
	const rows: [string, string][] = [];

	if (data.post_id !== undefined) rows.push(['Post #', String(data.post_id)]);

	if (data.score !== undefined) rows.push(['Score', data.score.toFixed(1)]);

	if (data.rating_count !== undefined) rows.push(['Ratings', formatCount(data.rating_count)]);

	if (data.favorite_count !== undefined) rows.push(['Favs', formatCount(data.favorite_count)]);

	if (data.comment_count !== undefined) rows.push(['Comments', formatCount(data.comment_count)]);

	if (data.media_type) rows.push(['Media', data.media_type]);

	if (data.published_at) rows.push(['Publicado', new Date(data.published_at).toLocaleDateString('es-ES')]);

	if (data.author_username) rows.push(['Autor', data.author_username]);

	return rows;
}

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
