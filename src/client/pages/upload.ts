import { store } from '../state/store.js';

export async function renderUpload(): Promise<string> {
	const user = store.get().user;

	if (!user) return `<div class="empty">Necesitas entrar con Google para subir.<div class="detail"><a href="/api/auth/google">Entrar con Google</a></div></div>`;

	return `
    <div class="page-head"><h1>Subir meme</h1></div>
    <form id="upload-form" class="form-stack">
      <div class="field">
        <label for="file">Archivo</label>
        <input type="file" id="file" name="file" accept="image/*,video/mp4,video/webm,image/gif" required />
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
      <div class="field">
        <label for="mediaType">Tipo</label>
        <select id="mediaType" name="mediaType">
          <option value="image">Imagen</option>
          <option value="gif">GIF</option>
          <option value="video">Video (solo trusted)</option>
        </select>
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
		const mediaTypeEl = document.getElementById('mediaType');
		const titleEl = document.getElementById('title');
		const status = document.getElementById('upload-status');

		if (!(tagsEl instanceof HTMLInputElement) || !(mediaTypeEl instanceof HTMLSelectElement) || !(titleEl instanceof HTMLInputElement) || !(status instanceof HTMLElement)) {
			return;
		}

		const tags = tagsEl.value.trim().split(/\s+/).filter(Boolean);

		if (tags.length === 0) {
			status.textContent = 'Escribe al menos un tag.';

			return;
		}

		const mediaType = mediaTypeEl.value;
		const title = titleEl.value.trim() || null;

		status.textContent = 'Subiendo...';

		const res = await fetch('/api/posts', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({ title, tags, media_type: mediaType }),
		});

		if (!res.ok) {
			const body = await res.text().catch(() => '');

			status.textContent = `Error: ${body}`;

			return;
		}

		const raw = (await res.json().catch(() => null)) as { publicId?: string } | null;
		const publicId = raw?.publicId;

		if (publicId) {
			status.textContent = 'Publicacion creada — redirigiendo...';

			setTimeout(() => {
				history.pushState(null, '', `/post/${publicId}`);
				window.dispatchEvent(new PopStateEvent('popstate'));
			}, 600);
		} else {
			status.textContent = 'Respuesta invalida del servidor.';
		}
	});
}
