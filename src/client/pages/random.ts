import { navigate } from '../app/router.js';
import { api } from '../services/api.js';

export async function renderRandom(): Promise<string> {
	try {
		const result = await api.posts.random();
		if (result.public_id) {
			navigate(`/post/${result.public_id}`);
			return '';
		}
	} catch {}
	return `<div class="empty">No hay publicaciones disponibles.<div class="detail"><a href="/" data-link>Volver</a></div></div>`;
}

export function bindRandom(): void {}
