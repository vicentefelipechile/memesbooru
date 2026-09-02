import { renderHeader } from '../components/header.js';
import { getMe } from '../services/api.js';
export async function renderUpload(): Promise<string> {
	const { user } = await getMe().catch(() => ({ user: null }));
	if (!user) return `${renderHeader(null)}<main class="page"><p>Necesitas login con Google para subir.</p><a href="/api/auth/google">Login</a></main>`;
	return `
    ${renderHeader(user)}
    <main class="page">
      <h1>Subir meme</h1>
      <form id="upload-form">
        <input type="file" id="file" accept="image/*,video/mp4,video/webm,image/gif" required />
        <input id="title" placeholder="Titulo (opcional)" maxlength="120" />
        <input id="tags" placeholder="tags separados por espacio: pepe doge reaccion" required />
        <select id="mediaType"><option value="image">Imagen</option><option value="gif">GIF</option><option value="video">Video (solo trusted)</option></select>
        <button>Subir</button>
      </form>
      <div id="upload-status"></div>
      <p class="hint">Cooldownd: cuentas nuevas 1 subida/hora. Videos solo trusted. Original se conserva, se generan variantes low/medium.</p>
    </main>`;
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
		if (!(tagsEl instanceof HTMLInputElement) || !(mediaTypeEl instanceof HTMLSelectElement) || !(titleEl instanceof HTMLInputElement) || !(status instanceof HTMLElement)) return;
		const tags = tagsEl.value.trim().split(/\s+/);
		const mediaType = mediaTypeEl.value;
		const title = titleEl.value;
		status.textContent = 'Subiendo...';
		const res = await fetch('/api/posts', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify({ title, tags, mediaType }) });
		if (!res.ok) status.textContent = `Error: ${await res.text()}`;
		else {
			const raw = await res.json();
			let publicId = '';
			if (typeof raw === 'object' && raw !== null && 'publicId' in raw && typeof raw.publicId === 'string') publicId = raw.publicId;
			status.textContent = `Creado ${publicId} — en procesamiento (variant low). Redirigiendo...`;
			setTimeout(() => location.assign(`/post/${publicId}`), 800);
		}
	});
}
