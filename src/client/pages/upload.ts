// =========================================================================================================
// Single upload form: images and GIFs go to R2, videos use Stream.
// =========================================================================================================

import { store } from '../state/store.js';
import { api, loginUrl } from '../services/api.js';

export function mediaTypeForFile(mime: string): 'image' | 'gif' | 'video' | null {
	if (mime === 'image/gif') return 'gif';
	if (mime === 'image/jpeg' || mime === 'image/png' || mime === 'image/webp') return 'image';
	if (mime === 'video/mp4' || mime === 'video/webm') return 'video';

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
        <input type="file" id="file" name="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm" required />
      </div>
      <div class="field">
        <label for="title">Título (opcional)</label>
        <input id="title" name="title" placeholder="Titulo" maxlength="120" />
      </div>
      <div class="field">
        <label for="tags">Tags</label>
        <input id="tags" name="tags" placeholder="pepe doge reaccion" required />
        <span class="hint">Separados por espacio, en minusculas.</span>
      </div>
      <button type="submit" class="primary">Subir</button>
    </form>
    <div id="upload-status" class="form-msg" aria-live="polite"></div>
    <p class="hint" style="margin-top:1rem">Cuentas nuevas: 1 subida por hora. Los videos requieren rango trusted. Se generan variantes low/medium automaticamente.</p>
  `;
}

export function bindUpload(): void {
	const form = document.getElementById('upload-form');

	if (!(form instanceof HTMLFormElement)) return;

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
			status.textContent = 'Archivo no compatible. Usa JPG, PNG, WebP, GIF, MP4 o WebM.';
			return;
		}

		const tags = tagsEl.value.trim().split(/\s+/).filter(Boolean);

		if (tags.length === 0) {
			status.textContent = 'Escribe al menos un tag.';

			return;
		}

		const title = titleEl.value.trim() || null;

		status.textContent = 'Subiendo...';

		try {
			const result = mediaType === 'video' ? await api.posts.uploadVideo(file, title, tags) : await api.posts.create({ title, tags, media_type: mediaType, file });
			status.textContent = 'Publicación creada; redirigiendo...';
			setTimeout(() => {
				history.pushState(null, '', `/post/${result.publicId}`);
				window.dispatchEvent(new PopStateEvent('popstate'));
			}, 600);
		} catch (error) {
			status.textContent = `Error: ${error instanceof Error ? error.message : 'No se pudo subir el archivo.'}`;
		}
	});
}
