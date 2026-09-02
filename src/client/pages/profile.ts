import { store } from '../state/store.js';

export async function renderProfile(): Promise<string> {
	const user = store.get().user;
	if (!user) return `<div class="empty">Necesitas entrar para ver tu perfil.<div class="detail"><a href="/api/auth/google">Entrar con Google</a></div></div>`;
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
    <p class="small muted"><a href="/settings" data-link>Configuración</a></p>
  `;
}

export function bindProfile(): void {}

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}