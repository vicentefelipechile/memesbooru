import { store } from '../state/store.js';
import { api, loginUrl } from '../services/api.js';

export async function renderProfile(): Promise<string> {
	const user = store.get().user;
	if (!user) return `<div class="empty">Necesitas entrar para ver tu perfil.<div class="detail"><a href="${loginUrl()}">Entrar con Google</a></div></div>`;
	const status = user.status ?? 'active';
	const display = user.display_name && user.display_name !== user.username ? user.display_name : user.username;
	return `
    <div class="page-head"><h1>${escapeHtml(display)}</h1></div>
    <section class="settings-section">
      <dl class="stat-grid">
        <dt>Usuario</dt><dd>@${escapeHtml(user.username)}</dd>
        <dt>Rango</dt><dd>${escapeHtml(user.rank)}</dd>
        <dt>Estado</dt><dd>${escapeHtml(status)}</dd>
      </dl>
    </section>
    <form id="profile-form" class="form-stack"><label for="display-name">Nombre visible</label><input id="display-name" maxlength="100" value="${escapeHtml(user.display_name ?? '')}"><button class="primary" type="submit">Guardar perfil</button><p id="profile-status" class="form-msg" aria-live="polite"></p></form>
    <p class="small muted"><a href="/settings" data-link>Configuración</a></p>
  `;
}

export function bindProfile(): void {
	const form = document.getElementById('profile-form');
	if (!(form instanceof HTMLFormElement)) return;
	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		const input = document.getElementById('display-name');
		const status = document.getElementById('profile-status');
		if (!(input instanceof HTMLInputElement) || !status) return;
		try {
			await api.auth.updateProfile(input.value.trim() || null);
			status.textContent = 'Perfil actualizado.';
			status.className = 'form-msg ok';
		} catch {
			status.textContent = 'No se pudo actualizar.';
			status.className = 'form-msg err';
		}
	});
}

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
