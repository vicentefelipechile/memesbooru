// =========================================================================================================
// COMMENTS (v2)
// Plain comment list: author + date byline, body. No cards.
// =========================================================================================================

export type CommentItem = { id: number; body: string; author_id: number; author_username?: string | null; created_at?: number };

export function formatDate(ts?: number): string {
	if (!ts) return '';
	return new Date(ts).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
}

export function renderCommentList(items: CommentItem[]): string {
	if (items.length === 0) return '<p class="none">Sin comentarios. Se el primero.</p>';
	return items
		.map(
			(c) => `<article class="comment">
    <div class="byline"><span class="author">${c.author_username ? escapeHtml(c.author_username) : `user #${c.author_id}`}</span>${c.created_at ? ` · ${formatDate(c.created_at)}` : ''}</div>
    <div class="body">${escapeHtml(c.body)}</div>
  </article>`,
		)
		.join('');
}

export function renderCommentForm(): string {
	return `<form id="comment-form" class="comment-form"><label for="c-body" class="small muted">Comentar</label><textarea id="c-body" maxlength="2000" placeholder="Escribe un comentario..."></textarea><button type="submit">Enviar</button></form>`;
}

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}