// =========================================================================================================
// Single upload form: images, GIFs and videos go to R2.
// =========================================================================================================

import { store } from '../state/store.js';
import { api, loginUrl } from '../services/api.js';
import { bindTagAutocomplete, renderTagAutocompleteField } from '../components/tag-autocomplete.js';
import { normalizeTag } from '../../validators';

export function mediaTypeForFile(mime: string): 'image' | 'gif' | 'video' | null {
	if (mime === 'image/gif') return 'gif';
	if (mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp') return 'image';
	if (mime === 'video/mp4') return 'video';

	return null;
}

export async function renderUpload(): Promise<string> {
	const user = store.get().user;

	if (!user) return `<div class="empty">Necesitas entrar con Google para subir.<div class="detail"><a href="${loginUrl()}">Entrar con Google</a></div></div>`;

	return `
    <div class="page-head"><h1>Subir meme</h1></div>
    <form id="upload-form" class="form-stack">
      <div class="field">
        <label for="file">Archivo</label>
		 <input type="file" id="file" name="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4" required />
      </div>
      <div class="field">
        <label for="title">Título (opcional)</label>
        <input id="title" name="title" placeholder="Titulo" maxlength="120" />
      </div>
      <div class="field">
        <label for="tags">Tags</label>
		 ${renderTagAutocompleteField('<input id="tags" name="tags" placeholder="pepe doge reaccion" maxlength="500" autocomplete="off" required />')}
		 <span class="hint">Separados por espacio. Los tags nuevos se crean como reacción; los existentes pueden seleccionarse en la lista.</span>
      </div>
      <button type="submit" class="primary">Subir</button>
    </form>
    <div id="upload-status" class="form-msg" aria-live="polite"></div>
	 <p class="hint" style="margin-top:1rem">Las cuentas sin permiso de subida libre tienen un límite de 1 subida por hora. Las imágenes generan versiones WebP/PNG y los GIF conservan la animación. Los vídeos MP4 de hasta 60 segundos generan tres resoluciones en R2.</p>
  `;
}

export function bindUpload(): void {
	const form = document.getElementById('upload-form');

	if (!(form instanceof HTMLFormElement)) return;
	const input = document.getElementById('tags');
	if (input instanceof HTMLInputElement) bindTagAutocomplete(input);

	form.addEventListener('submit', async (e) => {
		e.preventDefault();

		const tagsEl = document.getElementById('tags');
		const titleEl = document.getElementById('title');
		const status = document.getElementById('upload-status');
		const fileEl = document.getElementById('file');

		if (!(tagsEl instanceof HTMLInputElement) || !(titleEl instanceof HTMLInputElement) || !(fileEl instanceof HTMLInputElement) || !(status instanceof HTMLElement)) {
			return;
		}

		const file = fileEl.files?.[0];
		if (!file) {
			status.textContent = 'Selecciona un archivo.';
			return;
		}

		const mediaType = mediaTypeForFile(file.type);

		if (!mediaType) {
			status.textContent = 'Archivo no compatible. Usa JPG, PNG, WebP, GIF o MP4.';
			return;
		}

		const rawTags = tagsEl.value.trim().split(/\s+/).filter(Boolean);
		const tags = [...new Set(rawTags.map(normalizeTag))];

		if (tags.length === 0 || tags.some((tag) => !tag || tag.length > 40)) {
			status.textContent = 'Escribe tags válidos de hasta 40 caracteres.';

			return;
		}

		const title = titleEl.value.trim() || null;
		if (tags.length > (mediaType === 'video' ? 50 : 20)) {
			status.textContent = `Demasiados tags (máximo ${mediaType === 'video' ? 50 : 20}).`;
			return;
		}

		status.textContent = 'Subiendo...';

		try {
			const result = await api.posts.create({ title, tags, media_type: mediaType, file });
			status.textContent = 'Procesando publicación…';
			for (let attempt = 0; attempt < 60 && status.isConnected; attempt++) {
				const ready = await api.posts
					.get(result.publicId)
					.then(() => true)
					.catch(() => false);
				if (ready) {
					history.pushState(null, '', `/post/${result.publicId}`);
					window.dispatchEvent(new PopStateEvent('popstate'));
					return;
				}
				await new Promise((resolve) => setTimeout(resolve, 2000));
			}
			if (status.isConnected) {
				const link = document.createElement('a');
				link.href = `/post/${encodeURIComponent(result.publicId)}`;
				link.dataset.link = '';
				link.textContent = 'Ver publicación';
				status.replaceChildren('El procesamiento continúa. Intenta abrirla en unos minutos: ', link);
			}
		} catch (error) {
			status.textContent = `Error: ${error instanceof Error ? error.message : 'No se pudo subir el archivo.'}`;
		}
	});
}
