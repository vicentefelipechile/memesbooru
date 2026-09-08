import { getPost, getComments } from '../services/api.js';
import { renderScore } from '../components/score.js';
import { renderCommentList, renderCommentForm, formatDate } from '../components/comment.js';
import { renderSideBlock, renderStatistics, renderTagged, type SidebarTag } from '../components/tag-sidebar.js';
import { formatCount } from '../components/search.js';
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
	const data = await getPost(publicId).catch(() => null);

	if (!data) return `<div class="error">Post no encontrado<div class="detail"><a href="/" data-link>Volver al inicio</a></div></div>`;

	if (data.redirectTo) {
		history.pushState(null, '', `/post/${data.redirectTo}`);
		window.dispatchEvent(new PopStateEvent('popstate'));

		return '';
	}

	const user = store.get().user;
	const restricted = data.restricted === true;

	return `
    <div class="post-layout">
      <section class="post-main">
        <div class="post-media">
          ${restricted ? `<p class="restricted">Este video es solo para usuarios trusted. Gana confianza publicando y participando.</p>` : `<img src="/api/posts/${publicId}/variants/medium" alt="post ${publicId}" loading="eager" />`}
        </div>
        <h1 class="post-title">${data.title ? escapeHtml(data.title) : `Post ${publicId}`}</h1>
        <div class="post-actions">
          <span id="score-line">${renderScore(data.score ?? 0, data.favorite_count ?? 0, data.comment_count ?? 0)}</span>
          <button id="vote-up">+1</button>
          <button id="vote-down">−1</button>
          <button id="fav-btn">Favorito</button>
          <button id="report-btn">Reportar</button>
        </div>
        <a href="/api/posts/${publicId}/variants/original" target="_blank" rel="noopener" class="button small">Ver original</a>
        ${data.description ? `<div class="post-description">${escapeHtml(data.description)}</div>` : ''}
      </section>
      <aside class="post-side">
        <section class="side-block"><h2>Statistics</h2><div id="stats">${renderStatistics(buildStatistics(data))}</div></section>
        <section class="side-block"><h2>Tagged</h2>${renderTagged(data.tags ?? [])}</section>
      </aside>
    </div>
    <section id="comments" class="comments">
      <h2>Comentarios</h2>
      <div id="comments-list"><p class="none">Cargando...</p></div>
      ${user ? renderCommentForm() : '<p class="none small">Inicia sesión para comentar.</p>'}
    </section>
  `;
}

// =========================================================================================================
// Bind — in-place updates, no page reload.
// =========================================================================================================

export function bindPost(publicId: string): void {
	const q = (s: string) => {
		const el = document.querySelector(s);

		return el instanceof HTMLElement ? el : null;
	};

	let faved = false;

	q('#vote-up')?.addEventListener('click', () => void rate(publicId, 1));
	q('#vote-down')?.addEventListener('click', () => void rate(publicId, -1));

	q('#fav-btn')?.addEventListener('click', async () => {
		const method = faved ? 'DELETE' : 'POST';
		const r = await fetch(`/api/post/${publicId}/favorite`, { method, credentials: 'include' }).catch(() => null);

		if (!r || !r.ok) return;

		faved = !faved;

		const btn = q('#fav-btn');

		if (btn instanceof HTMLButtonElement) btn.textContent = faved ? 'Favorito ✓' : 'Favorito';

		await refreshPost(publicId);
	});

	q('#report-btn')?.addEventListener('click', () => {
		const reason = prompt('Motivo del reporte:');

		if (!reason) return;

		fetch('/api/moderation/reports', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ target_type: 'post', target_id: 0, reason }),
		}).then((r) => alert(r.ok ? 'Reportado' : 'No se pudo reportar'));
	});

	bindCommentForm(publicId);
	loadComments(publicId);
}

async function rate(publicId: string, value: number): Promise<void> {
	const r = await fetch(`/api/post/${publicId}/rating`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		credentials: 'include',
		body: JSON.stringify({ value }),
	}).catch(() => null);

	if (r && r.ok) await refreshPost(publicId);
}

// Refetch the post and update score + statistics in place.
async function refreshPost(publicId: string): Promise<void> {
	const data = await getPost(publicId).catch(() => null);

	if (!data) return;

	const scoreLine = document.getElementById('score-line');

	if (scoreLine) scoreLine.innerHTML = renderScore(data.score ?? 0, data.favorite_count ?? 0, data.comment_count ?? 0);

	const stats = document.getElementById('stats');

	if (stats) stats.innerHTML = renderStatistics(buildStatistics(data));
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

		const r = await fetch(`/api/comments/post/${publicId}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ body }),
		}).catch(() => null);

		if (!r || !r.ok) return;

		const user = store.get().user;
		const author = user?.username ?? '';
		const list = document.getElementById('comments-list');

		if (list) {
			list.insertAdjacentHTML('beforeend', `<article class="comment"><div class="byline"><span class="author">${escapeHtml(author)}</span> · ${formatDate(Date.now())}</div><div class="body">${escapeHtml(body)}</div></article>`);

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
	getComments(publicId)
		.then((res) => {
			const list = document.getElementById('comments-list');

			if (list) list.innerHTML = renderCommentList(res.data);
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
