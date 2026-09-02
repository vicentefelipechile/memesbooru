import { store, THEMES, setTheme, type ThemeName } from '../state/store.js';
import { totpSetup, totpVerify } from '../services/api.js';

const THEME_LABELS: Record<ThemeName, string> = {
	android: 'Android (verde)',
	solarized: 'Solarized (cálido)',
	gruvbox: 'Gruvbox (retro)',
	nord: 'Nord (frío)',
};

export async function renderSettings(): Promise<string> {
	const user = store.get().user;
	if (!user) return `<div class="empty">Necesitas entrar para configurar tu cuenta.<div class="detail"><a href="/api/auth/google">Entrar con Google</a></div></div>`;
	const theme = store.get().theme;
	return `
    <div class="page-head"><h1>Configuración</h1></div>
    <section class="settings-section">
      <h2>Tema</h2>
      <div class="form-stack">
        <div class="field">
          <label for="theme-select">Aspecto de la página</label>
          <select id="theme-select">
            ${THEMES.map((t) => `<option value="${t}" ${t === theme ? 'selected' : ''}>${THEME_LABELS[t]}</option>`).join('')}
          </select>
          <span class="hint">Se guarda en este navegador.</span>
        </div>
      </div>
    </section>
    <section class="settings-section">
      <h2>Verificación en dos pasos (TOTP)</h2>
      <div id="totp-box" class="form-stack">
        <button id="totp-setup-btn" type="button">Configurar autenticador</button>
        <div id="totp-output" class="form-msg" aria-live="polite"></div>
      </div>
    </section>
  `;
}

export function bindSettings(): void {
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
			const res = await totpSetup().catch(() => null);
			if (!res) {
				out.textContent = 'No se pudo iniciar la configuración.';
				out.className = 'form-msg err';
				return;
			}
			out.textContent = `Añade ${res.uri} a tu autenticador, o introduce el secreto manualmente: ${res.secret}`;
			out.className = 'form-msg ok';
			setupBtn.remove();
			const box = document.getElementById('totp-box');
			if (box) {
				const form = document.createElement('form');
				form.className = 'form-stack';
				form.innerHTML = `<div class="field"><label for="totp-code">Código de 6 dígitos</label><input id="totp-code" inputmode="numeric" maxlength="6" pattern="[0-9]{6}" required /></div><button type="submit" class="primary">Verificar</button>`;
				box.appendChild(form);
				form.addEventListener('submit', async (e) => {
					e.preventDefault();
					const codeEl = document.getElementById('totp-code');
					if (!(codeEl instanceof HTMLInputElement)) return;
					const ver = await totpVerify(codeEl.value).catch(() => null);
					const out2 = document.getElementById('totp-output');
					if (out2) {
						if (ver?.ok) {
							out2.textContent = `Activado. Códigos de recuperación: ${(ver.recoveryCodes ?? []).join(', ')}`;
							out2.className = 'form-msg ok';
							form.remove();
						} else {
							out2.textContent = 'Código inválido.';
							out2.className = 'form-msg err';
						}
					}
				});
			}
		});
	}
}