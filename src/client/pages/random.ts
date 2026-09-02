import { navigate } from '../app/router.js';

export async function renderRandom(): Promise<string> {
	try {
		const res = await fetch('/api/posts/random', { credentials: 'include' });
		if (res.ok) {
			const j = (await res.json()) as { public_id?: string };
			if (j.public_id) {
				navigate(`/post/${j.public_id}`);
				return '';
			}
		}
	} catch {}
	return `<div class="empty">No hay publicaciones disponibles.<div class="detail"><a href="/" data-link>Volver</a></div></div>`;
}

export function bindRandom(): void {}
