// =========================================================================================================
// SECTION PAGES
// =========================================================================================================
// Compact public pages used by the shared navigation.
// =========================================================================================================

import { api, loginUrl } from '../services/api.js';
import { store } from '../state/store.js';
import { bindTagAutocomplete, renderTagAutocompleteField } from '../components/tag-autocomplete.js';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../components/sidebar.js';
import { mountTurnstile, type TurnstileWidget } from '../components/turnstile.js';

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
	moderation: { title: 'Moderación', body: 'Panel reservado para moderadores.' },
};

function esc(value: string | number | null | undefined): string {
	return String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

function form(name: string, fields: string, submit: string): string {
	const widget = name === 'login' || name === 'register' ? '<div data-turnstile aria-label="Verificación antibots"></div>' : '';
	return `<form id="create" class="form-stack section-form" data-section-form="${name}">${fields}${widget}<button class="primary" type="submit" ${widget ? 'disabled' : ''}>${submit}</button><p class="form-msg" data-form-status role="status" aria-live="polite"></p></form>`;
}

export async function renderSection(name: string, mode: 'list' | 'create' | 'edit' = 'list'): Promise<string> {
	if (mode !== 'list') {
		if ((name === 'tags' || name === 'aliases') && !store.get().user?.permissions?.includes('edit_tags')) return '<p class="error">Necesitas permiso para editar tags.</p>';
		const query = new URL(location.href).searchParams;
		const tagId = name === 'tags' && mode === 'edit' ? Number(query.get('id')) : 0;
		if (name === 'tags' && mode === 'edit' && (!Number.isSafeInteger(tagId) || tagId < 1)) return '<p class="error">Selecciona un tag desde la lista.</p>';
		const tag = name === 'tags' && mode === 'edit' ? await api.tags.get(tagId) : null;
		const aliasId = name === 'aliases' && mode === 'edit' ? Number(query.get('id')) : 0;
		if (name === 'aliases' && mode === 'edit' && (!Number.isSafeInteger(aliasId) || aliasId < 1)) return '<p class="error">Selecciona un alias desde la lista.</p>';
		const alias = aliasId ? await api.tags.getAlias(aliasId) : null;
		const tagField = `<div class="field"><label for="section-tag-input">Tag</label>${renderTagAutocompleteField('<input id="section-tag-input" name="tag" required maxlength="100" autocomplete="off" data-single-tag>')}</div>`;
		const forms: Record<string, string> = {
			wiki: form('wiki', `${tagField}<label>Título<input name="title" required maxlength="200"></label><label>Contenido<textarea name="body" required maxlength="10000"></textarea></label>`, 'Crear artículo'),
			aliases: form(
				'alias',
				`${aliasId ? `<input type="hidden" name="id" value="${aliasId}">` : ''}<label>Alias<input name="alias" value="${esc(alias?.alias_normalized)}" required maxlength="100"></label><small class="hint">Nombre alternativo de un tag existente; se normaliza a minúsculas y guiones bajos.</small>${tagField.replace('name="tag"', `name="tag" value="${esc(alias?.normalized_name)}"`)}`,
				aliasId ? 'Guardar alias' : 'Añadir alias',
			),
			artists: form('artist', '<label>Nombre<input name="name" required maxlength="100"></label>', 'Crear artista'),
			pools: form('pool', '<label>Nombre<input name="name" required maxlength="120"></label><label>Descripción<textarea name="description" maxlength="2000"></textarea></label>', 'Crear pool'),
			forum: form(
				'topic',
				'<label>Categoría<input name="category_id" type="number" min="1" required></label><label>Título<input name="title" required maxlength="200"></label><label>Mensaje<textarea name="body" required maxlength="5000"></textarea></label>',
				'Crear tema',
			),
			tags: form(
				mode === 'create' ? 'tag-create' : 'tag',
				`${tag ? `<input name="id" type="hidden" value="${tagId}">` : '<label>Nombre del tag<input name="name" required maxlength="100" placeholder="nombre_del_tag"></label>'}<label>Nombre visible<input name="display_name" value="${esc(tag?.display_name ?? tag?.normalized_name)}" ${tag ? 'required' : ''} maxlength="100" pattern="[a-z0-9]+(_[a-z0-9]+)*(_\\([a-z0-9]+(_[a-z0-9]+)*\\))?" title="Minúsculas, números y guiones bajos; opcionalmente _(tipo)." autocomplete="off"><small class="hint">Sin espacios. Ej.: curitoons, carl_jhonson_(personaje).</small></label><label>Descripción<textarea name="description" maxlength="2000">${esc(tag?.description)}</textarea></label><label>Categoría<select name="category">${CATEGORY_ORDER.map((category) => `<option value="${category}" ${tag?.category === category ? 'selected' : ''}>${category === 'source' ? 'Origen (juegos, series, películas)' : CATEGORY_LABELS[category]}</option>`).join('')}</select></label>`,
				'Guardar tag',
			),
		};
		const title: Record<string, string> = { wiki: 'Crear artículo', aliases: aliasId ? 'Editar alias' : 'Añadir alias', artists: 'Añadir artista', tags: tag ? 'Editar tag' : 'Crear tag', pools: 'Crear pool', forum: 'Crear tema' };

		return `<section class="page-head"><h1>${title[name]}${tag ? `: ${esc(tag.normalized_name)}` : ''}</h1></section>${forms[name]}`;
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
		if (!store.get().user) return '<section class="page-head"><h1>Contacto</h1><p>Entra para enviar una consulta al equipo.</p></section><p><a href="/login" data-link>Entrar</a></p>';
		return `<section class="page-head"><h1>Contacto</h1><p>Envía una consulta al equipo de Memesbooru.</p></section>${form('contact', '<label>Asunto<input name="subject" required maxlength="200"></label><label>Mensaje<textarea name="body" required maxlength="10000"></textarea></label>', 'Enviar')}`;
	}

	if (name === 'login')
		return `<section class="page-head"><h1>Entrar</h1><p>Accede con usuario y contraseña o Google.</p></section>${form('login', '<label>Usuario<input name="username" required minlength="3" maxlength="24" autocomplete="username"></label><label>Contraseña<input name="password" type="password" required minlength="8" autocomplete="current-password"></label>', 'Entrar')}<p><a href="/register" data-link>Crear cuenta</a> · <a href="${loginUrl()}">Google</a></p>`;
	if (name === 'register')
		return `<section class="page-head"><h1>Crear cuenta</h1></section>${form('register', '<label>Usuario<input name="username" required minlength="3" maxlength="24" pattern="[A-Za-z0-9_]+" autocomplete="username"></label><label>Contraseña<input name="password" type="password" required minlength="8" autocomplete="new-password"></label>', 'Registrarse')}`;

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
		const rows = result.data.map((item) => `<tr><td>${esc(item.title)}</td><td>${esc(item.normalized_name)}</td><td>${esc(item.updated_at)}</td></tr>`).join('');
		return `<section class="page-head"><h1>Wiki</h1><p>Documentación de tags y contexto.</p></section><table class="data-table"><thead><tr><th>Título</th><th>Tag</th><th>Actualizado</th></tr></thead><tbody>${rows || '<tr><td colspan="3">No hay artículos.</td></tr>'}</tbody></table>`;
	}

	if (name === 'aliases') {
		const params = new URL(location.href).searchParams;
		const q = params.get('q') ?? '';
		const result = await api.tags.aliases(q, Number(params.get('cursor')) || undefined);
		const canEdit = store.get().user?.permissions?.includes('edit_tags');
		const rows = result.data
			.map(
				(item) =>
					`<tr><td>${esc(item.alias_normalized)}</td><td><a href="/posts?tags=${encodeURIComponent(item.normalized_name)}" data-link>${esc(item.normalized_name)}</a></td><td>${new Date(item.created_at).toLocaleDateString('es-ES')}</td>${canEdit ? `<td><a href="/aliases/edit?id=${item.id}" data-link>Editar</a> <button data-alias-delete="${item.id}">Eliminar</button></td>` : ''}</tr>`,
			)
			.join('');
		return `<section class="page-head"><h1>Aliases</h1><p>Nombres alternativos que apuntan a un tag.</p></section><form data-directory="aliases"><label>Buscar alias <input name="q" value="${esc(q)}" maxlength="100"></label><button>Buscar</button></form><p data-directory-status role="status" aria-live="polite"></p><table class="data-table"><thead><tr><th>Alias</th><th>Destino</th><th>Creado</th>${canEdit ? '<th>Acciones</th>' : ''}</tr></thead><tbody>${rows || `<tr><td colspan="${canEdit ? 4 : 3}">No hay aliases.</td></tr>`}</tbody></table>${result.nextCursor ? `<a href="/aliases?q=${encodeURIComponent(q)}&cursor=${result.nextCursor}" data-link>Siguiente →</a>` : ''}`;
	}

	if (name === 'tags') {
		const params = new URL(location.href).searchParams;
		const q = params.get('q') ?? '';
		const category = params.get('category') ?? '';
		const result = await api.tags.list(q, Number(params.get('cursor')) || undefined, category);
		const canEdit = store.get().user?.permissions?.includes('edit_tags');
		const rows = result.data
			.map(
				(item) =>
					`<tr><td><a href="/posts?tags=${encodeURIComponent(item.normalized_name)}" data-link>${esc(item.display_name ?? item.normalized_name)}</a></td><td>${esc(CATEGORY_LABELS[String(item.category)] ?? item.category)}</td><td>${item.usage_count}</td><td>${esc(item.status)}</td>${canEdit ? `<td><button data-tag-edit="${item.id}">Editar</button></td>` : ''}</tr>`,
			)
			.join('');
		return `<section class="page-head"><h1>Tags</h1><p>Listado y categorías de tags.</p></section><form data-directory="tags"><label>Buscar tag <input name="q" value="${esc(q)}" maxlength="100"></label><label>Categoría <select name="category"><option value="">Todas</option>${CATEGORY_ORDER.map((value) => `<option value="${value}" ${category === value ? 'selected' : ''}>${CATEGORY_LABELS[value]}</option>`).join('')}</select></label><button>Buscar</button></form><table class="data-table"><thead><tr><th>Nombre</th><th>Categoría</th><th>Posts</th><th>Estado</th>${canEdit ? '<th>Acciones</th>' : ''}</tr></thead><tbody>${rows || `<tr><td colspan="${canEdit ? 5 : 4}">No hay tags.</td></tr>`}</tbody></table>${result.nextCursor ? `<a href="/tags?q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}&cursor=${result.nextCursor}" data-link>Siguiente →</a>` : ''}`;
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
	const directory = document.querySelector<HTMLFormElement>('[data-directory]');
	directory?.addEventListener('submit', (event) => {
		event.preventDefault();
		const data = new FormData(directory);
		const params = new URLSearchParams();
		if (data.get('q')) params.set('q', String(data.get('q')).trim());
		if (data.get('category')) params.set('category', String(data.get('category')));
		history.pushState(null, '', `/${name}${params.size ? `?${params}` : ''}`);
		window.dispatchEvent(new PopStateEvent('popstate'));
	});
	for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-alias-delete]'))) {
		button.addEventListener('click', async () => {
			button.disabled = true;
			try {
				await api.tags.deleteAlias(Number(button.dataset.aliasDelete));
				button.closest('tr')?.remove();
			} catch (error) {
				button.disabled = false;
				const status = document.querySelector<HTMLElement>('[data-directory-status]');
				if (status) status.textContent = error instanceof Error ? error.message : 'No se pudo eliminar.';
			}
		});
	}
	if (name === 'tags') {
		for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>('[data-tag-edit]')))
			button.addEventListener('click', () => {
				history.pushState(null, '', `/tags/edit?id=${encodeURIComponent(button.dataset.tagEdit ?? '')}`);
				window.dispatchEvent(new PopStateEvent('popstate'));
			});
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
	let widget: TurnstileWidget | null = null;
	if (name === 'login' || name === 'register') {
		void api.auth
			.turnstile()
			.then(({ siteKey }) => mountTurnstile(formElement, siteKey, name === 'register' ? 'signup' : 'login'))
			.then((mounted) => {
				if (!mounted || !formElement.isConnected) return;
				widget = mounted;
				const button = formElement.querySelector<HTMLButtonElement>('button[type="submit"]');
				if (button) button.disabled = false;
			})
			.catch((error) => {
				console.error('Turnstile setup failed', error);
				const status = formElement.querySelector<HTMLElement>('[data-form-status]');
				if (status) status.textContent = 'No se pudo cargar la verificación. Vuelve a intentar más tarde.';
			});
	}
	const tagInput = formElement.querySelector<HTMLInputElement>('[name="tag"]');
	if (tagInput) bindTagAutocomplete(tagInput);
	formElement.addEventListener('submit', async (event) => {
		event.preventDefault();
		const status = formElement.querySelector<HTMLElement>('[data-form-status]');
		const submit = formElement.querySelector<HTMLButtonElement>('button[type="submit"]');
		if (submit?.disabled) return;
		if (submit) submit.disabled = true;
		const data: Record<string, string> = {};
		new FormData(formElement).forEach((value, key) => {
			if (typeof value === 'string') data[key] = value;
		});
		try {
			const token = name === 'login' || name === 'register' ? widget?.token() : undefined;
			if ((name === 'login' || name === 'register') && !token) throw new Error('Completa la verificación para continuar.');
			if (name === 'contact') await api.community.createContact(data);
			else if (name === 'login') {
				const result = await api.auth.login(data.username, data.password, token!);
				store.set({ user: result.user });
				history.pushState(null, '', '/');
				window.dispatchEvent(new Event('session-changed'));
				return;
			} else if (name === 'register') {
				const result = await api.auth.register(data.username, data.password, token!);
				store.set({ user: result.user });
				history.pushState(null, '', '/');
				window.dispatchEvent(new Event('session-changed'));
				return;
			} else if (name === 'artist') await api.community.createArtist(data);
			else if (name === 'pool') await api.community.createPool(data);
			else if (name === 'topic') await api.community.createTopic({ ...data, category_id: Number(data.category_id) });
			else if (name === 'wiki') await api.community.createWiki(data);
			else if (name === 'alias') {
				if (data.id) await api.tags.editAlias(Number(data.id), { alias: data.alias, tag: data.tag });
				else await api.tags.addAlias({ alias: data.alias, tag: data.tag });
				history.pushState(null, '', '/aliases');
				window.dispatchEvent(new PopStateEvent('popstate'));
				return;
			} else if (name === 'tag-create') {
				await api.tags.create({ name: data.name, display_name: data.display_name || null, description: data.description || null, category: data.category });
				history.pushState(null, '', '/tags');
				window.dispatchEvent(new PopStateEvent('popstate'));
				return;
			} else if (name === 'tag') {
				if (!Number.isSafeInteger(Number(data.id)) || Number(data.id) < 1) throw new Error('Selecciona un tag de la lista.');
				await api.tags.edit(Number(data.id), { display_name: data.display_name, description: data.description || null, category: data.category });
			}
			if (status) status.textContent = 'Guardado.';
			if (name !== 'tag') formElement.reset();
		} catch (error) {
			if (status) status.textContent = error instanceof Error ? error.message : 'No se pudo guardar.';
		} finally {
			if (submit) submit.disabled = false;
			if (name === 'login' || name === 'register') widget?.reset();
		}
	});
}
