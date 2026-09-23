// =========================================================================================================
// SECTION PAGES
// =========================================================================================================
// Compact public pages used by the shared navigation.
// =========================================================================================================

import { api, loginUrl } from '../services/api.js';
import { store } from '../state/store.js';

const CONTENT: Record<string, { title: string; body: string }> = {
	wiki: { title: 'Wiki', body: 'La wiki documenta tags, fuentes y contexto de los memes.' },
	aliases: { title: 'Aliases', body: 'Los aliases redirigen nombres alternativos al tag canónico.' },
	artists: { title: 'Artists', body: 'Directorio de artistas y creadores asociados a publicaciones.' },
	tags: { title: 'Tags', body: 'Explora y busca los tags activos del catálogo.' },
	pools: { title: 'Pools', body: 'Colecciones ordenadas de publicaciones.' },
	forum: { title: 'Forum', body: 'Conversaciones, anuncios y soporte de la comunidad.' },
	top: { title: 'Top 100', body: 'Las publicaciones mejor valoradas del catálogo.' },
	help: { title: 'Ayuda', body: 'Consulta las reglas de publicación, búsqueda, tags y seguridad de la cuenta.' },
	about: { title: 'Acerca de', body: 'Memesbooru es un catálogo SFW de memes en español.' },
	contact: { title: 'Contacto', body: 'Para soporte, reportes legales o consultas de la comunidad, contacta a los moderadores.' },
	dmca: { title: 'DMCA', body: 'Las solicitudes de retirada deben incluir la obra, la URL afectada y los datos del titular.' },
	tos: { title: 'Términos de servicio', body: 'Memesbooru acepta únicamente contenido SFW y acciones realizadas de buena fe.' },
	account: { title: 'Mi cuenta', body: 'Administra tu perfil, seguridad, favoritos y preferencias.' },
	mail: { title: 'My Mail', body: 'La mensajería interna permite contactar a otros usuarios de forma privada.' },
	moderation: { title: 'Moderación', body: 'Panel reservado para moderadores.' },
};

function esc(value: string | number | null | undefined): string {
	return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

function form(name: string, fields: string, submit: string): string {
	return `<form id="create" class="form-stack section-form" data-section-form="${name}">${fields}<button class="primary" type="submit">${submit}</button><p class="form-msg" data-form-status></p></form>`;
}

export async function renderSection(name: string, mode: 'list' | 'create' | 'edit' = 'list'): Promise<string> {
	if (mode !== 'list') {
		const forms: Record<string, string> = {
			wiki: form(
				'wiki',
				'<label>Tag ID<input name="tag_id" type="number" min="1" required></label><label>Título<input name="title" required maxlength="200"></label><label>Contenido<textarea name="body" required maxlength="10000"></textarea></label>',
				'Crear artículo',
			),
			aliases: form('alias', '<label>Alias<input name="alias" required maxlength="100"></label><label>Tag ID<input name="tag_id" type="number" min="1" required></label>', 'Añadir alias'),
			artists: form('artist', '<label>Nombre<input name="name" required maxlength="100"></label>', 'Crear artista'),
			pools: form('pool', '<label>Nombre<input name="name" required maxlength="120"></label><label>Descripción<textarea name="description" maxlength="2000"></textarea></label>', 'Crear pool'),
			forum: form(
				'topic',
				'<label>Categoría<input name="category_id" type="number" min="1" required></label><label>Título<input name="title" required maxlength="200"></label><label>Mensaje<textarea name="body" required maxlength="5000"></textarea></label>',
				'Crear tema',
			),
			tags: form(
				'tag',
				'<label>ID<input name="id" type="number" min="1" required></label><label>Nombre visible<input name="display_name" maxlength="200"></label><label>Descripción<textarea name="description" maxlength="2000"></textarea></label><label>Categoría<select name="category"><option>reaction</option><option>source</option><option>people</option><option>character</option><option>meta</option></select></label>',
				'Guardar tag',
			),
		};
		const title: Record<string, string> = { wiki: 'Crear artículo', aliases: 'Añadir alias', artists: 'Añadir artista', tags: 'Editar tag', pools: 'Crear pool', forum: 'Crear tema' };

		return `<section class="page-head"><h1>${title[name]}</h1></section>${forms[name]}`;
	}

	if (name === 'comments') {
		const result = await api.comments.recent().catch(() => ({ data: [] }));
		const rows = result.data
			.map(
				(comment) =>
					`<article class="comment-row"><a href="/post/${comment.post_id}" data-link>Post ${comment.post_id}</a> · <strong>${esc(comment.author_username ?? 'usuario')}</strong><time>${comment.created_at ? new Date(comment.created_at).toLocaleString('es-CL') : ''}</time><p>${esc(comment.body)}</p></article>`,
			)
			.join('');

		return `<section class="page-head"><h1>Comentarios</h1><p>Comentarios recientes de la comunidad.</p></section><div class="comment-list">${rows || '<p class="empty">No hay comentarios.</p>'}</div>`;
	}

	if (name === 'top') {
		const params = new URL(location.href).searchParams;
		const period = params.get('period') ?? 'all';
		const sort = params.get('sort') ?? 'score';
		const result = await api.top(100, period, sort).catch(() => ({ data: [] }));
		const rows = result.data
			.map((post) => `<tr><td><a href="/post/${post.public_id}" data-link>${post.public_id}</a></td><td>${post.media_type}</td><td>${post.score}</td><td>${post.favorite_count}</td><td>${post.comment_count}</td></tr>`)
			.join('');
		return `<section class="page-head"><h1>Top 100</h1><p>Publicaciones mejor valoradas.</p><nav class="section-links"><a href="/top?period=all&sort=score" data-link>Todo · score</a> · <a href="/top?period=week&sort=score" data-link>Semana</a> · <a href="/top?period=month&sort=favorites" data-link>Mes · favoritos</a> · <a href="/top?period=day&sort=recent" data-link>Hoy · recientes</a></nav></section><table class="data-table"><thead><tr><th>Post</th><th>Tipo</th><th>Score</th><th>Favoritos</th><th>Comentarios</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No hay publicaciones.</td></tr>'}</tbody></table>`;
	}

	if (name === 'contact') {
		return `<section class="page-head"><h1>Contacto</h1><p>Envía una consulta al equipo de Memesbooru.</p></section>${form('contact', '<label>Correo<input name="email" type="email" required maxlength="320"></label><label>Asunto<input name="subject" required maxlength="200"></label><label>Mensaje<textarea name="body" required maxlength="10000"></textarea></label>', 'Enviar')}`;
	}

	if (name === 'login')
		return `<section class="page-head"><h1>Entrar</h1><p>Accede con correo y contraseña o Google.</p></section>${form('login', '<label>Correo<input name="email" type="email" required></label><label>Contraseña<input name="password" type="password" required minlength="8"></label>', 'Entrar')}<p><a href="/register" data-link>Crear cuenta</a> · <a href="${loginUrl()}">Google</a></p>`;
	if (name === 'register')
		return `<section class="page-head"><h1>Crear cuenta</h1></section>${form('register', '<label>Usuario<input name="username" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_]+"></label><label>Correo<input name="email" type="email" required></label><label>Contraseña<input name="password" type="password" required minlength="8"></label>', 'Registrarse')}`;

	if (name === 'artists') {
		const result = await api.community.artists().catch(() => ({ data: [] }));
		const rows = result.data.map((item) => `<tr><td>${esc(item.name)}</td><td>${esc(item.status)}</td><td>${esc(item.updated_at)}</td></tr>`).join('');
		return `<section class="page-head"><h1>Artists</h1><p>Directorio de artistas.</p></section><table class="data-table"><thead><tr><th>Nombre</th><th>Estado</th><th>Actualizado</th></tr></thead><tbody>${rows || '<tr><td colspan="3">No hay artistas.</td></tr>'}</tbody></table>`;
	}

	if (name === 'pools') {
		const result = await api.community.pools().catch(() => ({ data: [] }));
		const rows = result.data.map((item) => `<tr><td>${esc(item.name)}</td><td>${esc(item.visibility)}</td><td>${esc(item.updated_at)}</td></tr>`).join('');
		return `<section class="page-head"><h1>Pools</h1><p>Colecciones ordenadas de publicaciones.</p></section><table class="data-table"><thead><tr><th>Nombre</th><th>Visibilidad</th><th>Actualizado</th></tr></thead><tbody>${rows || '<tr><td colspan="3">No hay pools.</td></tr>'}</tbody></table>`;
	}

	if (name === 'forum') {
		const result = await api.community.topics().catch(() => ({ data: [] }));
		const rows = result.data.map((item) => `<tr><td>${item.is_pinned ? 'Fijado' : ''} ${esc(item.title)}</td><td>${esc(item.status)}</td><td>${esc(item.reply_count)}</td></tr>`).join('');
		return `<section class="page-head"><h1>Forum</h1><p>Temas y conversaciones de la comunidad.</p></section><table class="data-table"><thead><tr><th>Tema</th><th>Estado</th><th>Respuestas</th></tr></thead><tbody>${rows || '<tr><td colspan="3">No hay temas.</td></tr>'}</tbody></table>`;
	}

	if (name === 'wiki') {
		const result = await api.community.wiki().catch(() => ({ data: [] }));
		const rows = result.data.map((item) => `<tr><td>${esc(item.title)}</td><td>${esc(item.tag_id)}</td><td>${esc(item.updated_at)}</td></tr>`).join('');
		return `<section class="page-head"><h1>Wiki</h1><p>Documentación de tags y contexto.</p></section><table class="data-table"><thead><tr><th>Título</th><th>Tag</th><th>Actualizado</th></tr></thead><tbody>${rows || '<tr><td colspan="3">No hay artículos.</td></tr>'}</tbody></table>`;
	}

	if (name === 'aliases') {
		const result = await api.tags.aliases().catch(() => ({ data: [] }));
		const rows = result.data.map((item) => `<tr><td>${esc(item.alias_normalized)}</td><td>${esc(item.tag_id)}</td><td>${esc(item.created_at)}</td></tr>`).join('');
		return `<section class="page-head"><h1>Aliases</h1><p>Los aliases redirigen nombres alternativos al tag canónico.</p></section><table class="data-table"><thead><tr><th>Alias</th><th>Destino</th><th>Creado</th></tr></thead><tbody>${rows || '<tr><td colspan="3">No hay aliases.</td></tr>'}</tbody></table>`;
	}

	if (name === 'tags') {
		const result = await api.tags.list().catch(() => ({ data: [] }));
		const rows = result.data
			.map((item) => `<tr><td>${esc(item.normalized_name)}</td><td>${esc(item.category)}</td><td>${esc(item.usage_count)}</td><td>${esc(item.status)}</td><td><button data-tag-edit="${esc(item.id)}">Editar</button></td></tr>`)
			.join('');
		return `<section class="page-head"><h1>Tags</h1><p>Listado y categorías de tags.</p></section><table class="data-table"><thead><tr><th>Nombre</th><th>Categoría</th><th>Posts</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${rows || '<tr><td colspan="5">No hay tags.</td></tr>'}</tbody></table>`;
	}

	if (name === 'mail') {
		const result = await api.community.mail().catch(() => ({ data: [] }));
		const rows = result.data.map((item) => `<tr><td>${esc(item.thread_id)}</td><td>${esc(item.sender_id)}</td><td>${esc(item.body)}</td><td>${esc(item.created_at)}</td></tr>`).join('');
		return `<section class="page-head"><h1>My Mail</h1><p>Mensajería interna.</p></section>${form('mail', '<label>Destinatario ID<input name="recipient_id" type="number" min="1" required></label><label>Asunto<input name="subject" required maxlength="200"></label><label>Mensaje<textarea name="body" required maxlength="10000"></textarea></label>', 'Enviar mensaje')}<table class="data-table"><tbody>${rows || '<tr><td>No hay mensajes.</td></tr>'}</tbody></table>`;
	}

	if (name === 'moderation') {
		const result = await api.moderation.reports().catch(() => ({ data: [] }));
		const rows = result.data
			.map(
				(item) =>
					`<tr><td>${esc(item.id)}</td><td>${esc(item.target_type)}</td><td>${esc(item.target_id)}</td><td>${esc(item.reason)}</td><td>${esc(item.status)}</td><td><button data-mod-action="approve" data-target-type="${esc(item.target_type)}" data-target-id="${esc(item.target_id)}">Aprobar</button><button data-mod-action="hide" data-target-type="${esc(item.target_type)}" data-target-id="${esc(item.target_id)}">Ocultar</button></td></tr>`,
			)
			.join('');
		return `<section class="page-head"><h1>Moderación</h1><p>Reportes pendientes para usuarios con permisos de moderación.</p></section><table class="data-table"><thead><tr><th>ID</th><th>Tipo</th><th>Objetivo</th><th>Motivo</th><th>Estado</th><th>Acciones</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No hay reportes.</td></tr>'}</tbody></table>`;
	}
	const lists: Record<string, () => Promise<{ data: Record<string, string | number | null>[] }>> = {
		artists: () => api.community.artists(),
		pools: () => api.community.pools(),
		forum: () => api.community.topics(),
		wiki: () => api.community.wiki(),
	};
	const loader = lists[name];

	if (loader) {
		const result = await loader().catch(() => ({ data: [] }));
		const rows = result.data
			.map(
				(item) =>
					`<tr>${Object.entries(item)
						.slice(0, 4)
						.map(([key, value]) => `<td><strong>${key.replaceAll('_', ' ')}</strong>: ${value ?? ''}</td>`)
						.join('')}</tr>`,
			)
			.join('');
		const section = CONTENT[name] ?? CONTENT.help;
		return `<section class="page-head"><h1>${section.title}</h1><p>${section.body}</p></section><table class="data-table"><tbody>${rows || '<tr><td>No hay registros.</td></tr>'}</tbody></table>`;
	}

	const section = CONTENT[name] ?? CONTENT.help;

	return `<section class="page-head"><h1>${section.title}</h1><p>${section.body}</p></section><div class="section-links"><a href="/posts" data-link>Volver al catálogo</a> · <a href="/help" data-link>Ayuda</a></div>`;
}

export function bindSection(name: string): void {
	if (name === 'tags') {
		for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-tag-edit]')))
			button.addEventListener('click', () => {
				history.pushState(null, '', `/tags/edit?id=${encodeURIComponent(button.dataset.tagEdit ?? '')}`);
				window.dispatchEvent(new PopStateEvent('popstate'));
			});
		const field = document.querySelector<HTMLInputElement>('[data-section-form="tag"] [name="id"]');
		if (field) field.value = new URL(location.href).searchParams.get('id') ?? '';
	}

	if (name === 'moderation') {
		for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-mod-action]')))
			button.addEventListener('click', async () => {
				await api.moderation.action({ action: button.dataset.modAction ?? 'hide', target_type: button.dataset.targetType ?? 'post', target_id: Number(button.dataset.targetId), reason: 'Report review' });
				button.disabled = true;
			});
		return;
	}
	const formElement = document.querySelector<HTMLFormElement>('[data-section-form]');
	if (!formElement) return;
	formElement.addEventListener('submit', async (event) => {
		event.preventDefault();
		const status = formElement.querySelector<HTMLElement>('[data-form-status]');
		const data: Record<string, string> = {};
		new FormData(formElement).forEach((value, key) => {
			if (typeof value === 'string') data[key] = value;
		});
		for (const key of ['category_id', 'tag_id', 'recipient_id']) if (data[key]) data[key] = String(Number(data[key]));
		try {
			if (name === 'contact') await api.community.createContact(data);
			else if (name === 'login') {
				const result = await api.auth.login(data.email, data.password);
				store.set({ user: result.user });
				history.pushState(null, '', '/');
				window.dispatchEvent(new PopStateEvent('popstate'));
				return;
			} else if (name === 'register') {
				const result = await api.auth.register(data.username, data.email, data.password);
				store.set({ user: result.user });
				history.pushState(null, '', '/');
				window.dispatchEvent(new PopStateEvent('popstate'));
				return;
			} else if (name === 'artist') await api.community.createArtist(data);
			else if (name === 'pool') await api.community.createPool(data);
			else if (name === 'topic') await api.community.createTopic({ ...data, category_id: Number(data.category_id) });
			else if (name === 'wiki') await api.community.createWiki({ ...data, tag_id: Number(data.tag_id) });
			else if (name === 'mail') await api.community.createMail({ ...data, recipient_id: Number(data.recipient_id) });
			else if (name === 'alias') await api.tags.addAlias({ ...data, tag_id: Number(data.tag_id) });
			else if (name === 'tag') await api.tags.edit(Number(data.id), { display_name: data.display_name || null, description: data.description || null, category: data.category });
			if (status) status.textContent = 'Guardado.';
			formElement.reset();
		} catch (error) {
			if (status) status.textContent = error instanceof Error ? error.message : 'No se pudo guardar.';
		}
	});
}
