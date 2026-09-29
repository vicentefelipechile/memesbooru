// =========================================================================================================
// Account settings: public profile, security, appearance and session.
// =========================================================================================================

import { store, THEMES, setTheme, type ThemeName } from '../state/store.js';
import { api, loginUrl } from '../services/api.js';
import { escapeAttr } from '../components/search.js';
import { bindPermissionSettings, renderPermissionSettings } from '../components/permission-settings.js';

const THEME_LABELS: Record<ThemeName, string> = {
	cyan: 'Memesbooru azul cyan',
	solarized: 'Solarized calido',
	gruvbox: 'Gruvbox retro',
	nord: 'Nord frio',
};

export async function renderSettings(): Promise<string> {
	const user = store.get().user;
	if (!user) return `<div class="empty">Necesitas entrar para configurar tu cuenta.<div class="detail"><a href="${loginUrl()}">Entrar con Google</a></div></div>`;
	const theme = store.get().theme;
	const profile = await api.profiles
		.get(user.username)
		.then((result) => result.profile)
		.catch((error: Error) => {
			console.error('Profile settings failed', error);
			return null;
		});
	const profileUrl = `/users/${encodeURIComponent(user.username)}`;
	const canManageRoles = user.permissions?.includes('manage_roles') === true;
	const roles = canManageRoles
		? await api.permissions.list().catch((error: Error) => {
				console.error('Role settings failed', error);
				return null;
			})
		: null;
	return `
	<div class="settings-layout">
		<nav class="settings-side" aria-label="Secciones de configuracion">
			<a href="#account-profile">Perfil</a><a href="#account-security">Seguridad</a><a href="#account-theme">Tema</a>${roles ? '<a href="#account-permissions">Permisos</a>' : ''}<a href="#account-session">Sesion</a>
		</nav>
		<div class="settings-main">
			<header class="page-head"><h1>Configuracion</h1><p>Administra tu perfil y las opciones de tu cuenta.</p></header>
			<section id="account-profile" class="settings-section"><h2>Perfil publico</h2>
				<p class="settings-help">Estos datos se muestran en tu <a href="${profileUrl}" data-link>perfil publico</a>.</p>
				${
					profile
						? `<form id="profile-form" class="form-stack">
					<label for="display-name">Nombre visible<input id="display-name" maxlength="100" autocomplete="nickname" value="${escapeAttr(profile.display_name ?? '')}"></label>
					<label for="profile-bio-input">Biografia<textarea id="profile-bio-input" maxlength="500">${escapeAttr(profile.bio ?? '')}</textarea></label>
					<label for="profile-avatar">URL del avatar (HTTPS)<input id="profile-avatar" type="url" maxlength="500" value="${escapeAttr(profile.avatar_url ?? '')}"></label>
					<button class="primary" type="submit">Guardar perfil</button><p id="profile-status" class="form-msg" role="status" aria-live="polite"></p>
				</form>`
						: '<p class="error" role="alert">No se pudo cargar el perfil.</p>'
				}
			</section>
			<section id="account-security" class="settings-section"><h2>Seguridad</h2>
				<h3>Contrasena</h3>
				<form id="password-form" class="form-stack"><label for="current-password">Contrasena actual<input id="current-password" type="password" autocomplete="current-password" required minlength="8"></label><label for="new-password">Nueva contrasena<input id="new-password" type="password" autocomplete="new-password" required minlength="8"></label><button class="primary" type="submit">Cambiar contrasena</button><p id="password-output" class="form-msg" role="status" aria-live="polite"></p></form>
				<h3>Verificacion en dos pasos</h3>
				<p class="settings-help">Protege el acceso con una aplicacion de autenticacion.</p>
				<div id="totp-box" class="form-stack"><button id="totp-setup-btn" type="button">Configurar autenticador</button><div id="totp-output" class="form-msg" role="status" aria-live="polite"></div></div>
			</section>
			<section id="account-theme" class="settings-section"><h2>Tema</h2>
				<div class="form-stack"><div class="field"><label for="theme-select">Aspecto de la pagina</label><select id="theme-select">${THEMES.map((t) => `<option value="${t}" ${t === theme ? 'selected' : ''}>${THEME_LABELS[t]}</option>`).join('')}</select><span class="hint">Se guarda en este navegador.</span></div></div>
			</section>
			${roles ? renderPermissionSettings(roles.data) : ''}
			<section id="account-session" class="settings-section"><h2>Sesion</h2><button id="logout-btn" type="button">Cerrar sesion</button><p id="logout-status" class="form-msg" role="status" aria-live="polite"></p></section>
		</div>
	</div>
  `;
}

export function bindSettings(): void {
	if (document.getElementById('role-form'))
		void api.permissions
			.list()
			.then((roles) => bindPermissionSettings(roles.data))
			.catch((error: Error) => console.error('Role settings failed', error));
	const profileForm = document.getElementById('profile-form');
	if (profileForm instanceof HTMLFormElement)
		profileForm.addEventListener('submit', async (event) => {
			event.preventDefault();
			const display = document.getElementById('display-name');
			const bio = document.getElementById('profile-bio-input');
			const avatar = document.getElementById('profile-avatar');
			const status = document.getElementById('profile-status');
			if (!(display instanceof HTMLInputElement) || !(bio instanceof HTMLTextAreaElement) || !(avatar instanceof HTMLInputElement) || !status) return;

			try {
				const { profile } = await api.profiles.update({ display_name: display.value.trim() || null, bio: bio.value.trim() || null, avatar_url: avatar.value.trim() || null });
				const user = store.get().user;
				if (user) store.set({ user: { ...user, display_name: profile.display_name } });
				status.textContent = 'Perfil actualizado.';
				status.className = 'form-msg ok';
			} catch (error) {
				console.error('Profile update failed', error);
				status.textContent = 'No se pudo actualizar el perfil.';
				status.className = 'form-msg err';
			}
		});

	document.getElementById('logout-btn')?.addEventListener('click', async () => {
		const status = document.getElementById('logout-status');
		try {
			await api.auth.logout();
			store.set({ user: null });
			history.replaceState(null, '', '/login');
			window.dispatchEvent(new Event('session-changed'));
		} catch (error) {
			console.error('Logout failed', error);
			if (status) {
				status.textContent = 'No se pudo cerrar la sesion.';
				status.className = 'form-msg err';
			}
		}
	});
	const passwordForm = document.getElementById('password-form');
	if (passwordForm instanceof HTMLFormElement)
		passwordForm.addEventListener('submit', async (event) => {
			event.preventDefault();
			const current = document.getElementById('current-password');
			const next = document.getElementById('new-password');
			const output = document.getElementById('password-output');
			if (!(current instanceof HTMLInputElement) || !(next instanceof HTMLInputElement) || !output) return;
			try {
				await api.auth.changePassword(current.value, next.value);
				output.textContent = 'Contrasena actualizada.';
				output.className = 'form-msg ok';
				passwordForm.reset();
			} catch {
				output.textContent = 'No se pudo actualizar la contrasena.';
				output.className = 'form-msg err';
			}
		});
	const themeSelect = document.getElementById('theme-select');
	if (themeSelect instanceof HTMLSelectElement) {
		themeSelect.addEventListener('change', () => {
			const v = themeSelect.value as ThemeName;
			if ((THEMES as readonly string[]).includes(v)) setTheme(v);
		});
	}
	const setupBtn = document.getElementById('totp-setup-btn');
	if (setupBtn instanceof HTMLButtonElement) {
		setupBtn.addEventListener('click', async () => {
			const out = document.getElementById('totp-output');
			if (!out) return;
			const res = await api.auth.totpSetup().catch(() => null);
			if (!res) {
				out.textContent = 'No se pudo iniciar la configuracion.';
				out.className = 'form-msg err';
				return;
			}
			out.textContent = `Agrega ${res.uri} a tu autenticador o introduce el secreto manualmente: ${res.secret}`;
			out.className = 'form-msg ok';
			setupBtn.remove();
			const box = document.getElementById('totp-box');
			if (box) {
				const form = document.createElement('form');
				form.className = 'form-stack';
				form.innerHTML = `<div class="field"><label for="totp-code">Codigo de 6 digitos</label><input id="totp-code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" required /></div><button type="submit" class="primary">Verificar</button>`;
				box.appendChild(form);
				form.addEventListener('submit', async (e) => {
					e.preventDefault();
					const codeEl = document.getElementById('totp-code');
					if (!(codeEl instanceof HTMLInputElement)) return;
					const ver = await api.auth.totpVerify(codeEl.value).catch(() => null);
					const out2 = document.getElementById('totp-output');
					if (out2) {
						if (ver?.ok) {
							out2.textContent = `Activado. Codigos de recuperacion: ${(ver.recoveryCodes ?? []).join(', ')}`;
							out2.className = 'form-msg ok';
							form.remove();
						} else {
							out2.textContent = 'Codigo invalido.';
							out2.className = 'form-msg err';
						}
					}
				});
			}
		});
	}
}
