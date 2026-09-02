import { renderHeader } from '../components/header.js';
import { getPost, getMe } from '../services/api.js';

export async function renderPost(publicId: string): Promise<string> {
	const user = (await getMe().catch(() => ({ user: null }))).user;
	const data = (await getPost(publicId).catch(() => null)) as Record<string, unknown> | null;
	if (!data) return `${renderHeader(user)}<main class="page"><p>Post no encontrado</p><a href="/" data-link>Volver</a></main>`;
	if ((data as { redirectTo?: string }).redirectTo) {
		// Duplicado — redirigir
		location.replace(`/post/${(data as { redirectTo: string }).redirectTo}`);
		return '';
	}
	const restricted = (data as { restricted?: boolean }).restricted;
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
        <h1>${(data as { title?: string }).title ?? publicId}</h1>
        <div>Score: ${(data as { score: number }).score ?? 0} · ♥ ${(data as { favorite_count: number }).favorite_count ?? 0} · 💬 ${(data as { comment_count: number }).comment_count ?? 0}</div>
        <div class="tags">${((data as { tags?: string[] }).tags ?? []).map((t) => `<a href="/?tags=${t}" data-link>#${t}</a>`).join(' ')}</div>
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
	const q = (s: string) => document.querySelector(s) as HTMLElement | null;
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
	// Cargar comentarios
	fetch(`/api/comments/post/${publicId}`)
		.then((r) => r.json())
		.then((j: unknown) => {
			const data = j as { data: { id: number; body: string; author_id: number }[] };
			const el = q('#comments');
			if (!el) return;
			if (data.data.length === 0) el.innerHTML = '<p>Sin comentarios. Se el primero.</p>';
			else el.innerHTML = data.data.map((c) => `<div class="comment"><p>${c.body}</p></div>`).join('') + `<form id="comment-form"><textarea id="c-body" maxlength="2000" placeholder="Comentar..."></textarea><button>Enviar</button></form>`;
			q('#comment-form')?.addEventListener('submit', async (e) => {
				e.preventDefault();
				const body = (q('#c-body') as HTMLTextAreaElement).value;
				await fetch(`/api/comments/post/${publicId}`, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ body }) });
				location.reload();
			});
		});
}
