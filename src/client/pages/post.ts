import { renderHeader } from '../components/header.js';
import { getPost, getMe, getComments } from '../services/api.js';
import { renderTagList } from '../components/tag-list.js';
import { renderScore } from '../components/score.js';
import { renderCommentList, renderCommentForm } from '../components/comment.js';

export async function renderPost(publicId: string): Promise<string> {
	const { user } = await getMe().catch(() => ({ user: null }));
	const data = await getPost(publicId).catch(() => null);
	if (!data) return `${renderHeader(user)}<main class="page"><p>Post no encontrado</p><a href="/" data-link>Volver</a></main>`;
	if (data.redirectTo) {
		location.replace(`/post/${data.redirectTo}`);
		return '';
	}
	const restricted = data.restricted === true;
	return `
    ${renderHeader(user)}
    <main class="page post-page">
      <div class="post-media">
        ${
					restricted
						? `<p class="restricted">Video solo para usuarios trusted. Gana confianza publicando y participando.</p>`
						: `
        <img src="/api/posts/${publicId}/variants/medium" alt="post" loading="eager" />
        <a href="/api/posts/${publicId}/variants/original" target="_blank" class="view-original">Ver original</a>`
				}
      </div>
      <div class="post-meta">
        <h1>${data.title ?? publicId}</h1>
        ${renderScore(data.score ?? 0, data.favorite_count ?? 0, data.comment_count ?? 0)}
        ${renderTagList(data.tags ?? [])}
        <div class="actions">
          <button id="vote-up">+1</button><button id="vote-down">-1</button>
          <button id="fav-btn">Favorito</button>
          <button id="report-btn">Reportar</button>
        </div>
      </div>
      <section id="comments" class="comments"><p>Cargando comentarios...</p></section>
    </main>
  `;
}
export function bindPost(publicId: string): void {
	const q = (s: string) => {
		const el = document.querySelector(s);
		return el instanceof HTMLElement ? el : null;
	};
	q('#vote-up')?.addEventListener('click', async () => {
		await fetch(`/api/post/${publicId}/rating`, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ value: 1 }) });
		location.reload();
	});
	q('#vote-down')?.addEventListener('click', async () => {
		await fetch(`/api/post/${publicId}/rating`, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ value: -1 }) });
		location.reload();
	});
	q('#fav-btn')?.addEventListener('click', async () => {
		await fetch(`/api/post/${publicId}/favorite`, { method: 'POST', credentials: 'include' });
		location.reload();
	});
	q('#report-btn')?.addEventListener('click', async () => {
		const reason = prompt('Motivo del reporte:');
		if (!reason) return;
		await fetch('/api/moderation/reports', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ targetType: 'post', targetId: 0, reason }) });
		alert('Reportado');
	});
	getComments(publicId).then((res) => {
			const el = q('#comments');
			if (!el) return;
			el.innerHTML = renderCommentList(res.data) + renderCommentForm();
			q('#comment-form')?.addEventListener('submit', async (e) => {
				e.preventDefault();
				const bodyEl = q('#c-body');
				if (!(bodyEl instanceof HTMLTextAreaElement)) return;
				const body = bodyEl.value;
				await fetch(`/api/comments/post/${publicId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ body }) });
				location.reload();
			});
		});
}
