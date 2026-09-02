export type CommentItem = { id: number; body: string; author_id: number };

export function renderCommentList(items: CommentItem[]): string {
	if (items.length === 0) return '<p>Sin comentarios. Se el primero.</p>';
	return items.map((c) => `<div class="comment"><p>${c.body}</p></div>`).join('');
}

export function renderCommentForm(): string {
	return `<form id="comment-form"><textarea id="c-body" maxlength="2000" placeholder="Comentar..."></textarea><button>Enviar</button></form>`;
}
