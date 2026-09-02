// =========================================================================================================
// ROUTER (v2)
// history.pushState SPA. Persistent shell (header) + main#page swap. Global data-link delegation.
// 7 views + 404. No full page reloads.
// =========================================================================================================

type Route = { pattern: RegExp; render: (match: RegExpMatchArray) => Promise<string>; bind?: (match: RegExpMatchArray) => void };

import { renderHeader } from '../components/header.js';
import { store } from '../state/store.js';
import { renderHome, bindHome, bindHomeGlobal } from '../pages/home.js';
import { renderPost, bindPost } from '../pages/post.js';
import { renderUpload, bindUpload } from '../pages/upload.js';
import { renderFavorites, bindFavorites } from '../pages/favorites.js';
import { renderSettings, bindSettings } from '../pages/settings.js';
import { renderProfile, bindProfile } from '../pages/profile.js';

const routes: Route[] = [
	{ pattern: /^\/(\?.*)?$/, render: () => renderHome(), bind: () => bindHome() },
	{ pattern: /^\/post\/([^/]+)$/, render: (m) => renderPost(m[1]), bind: (m) => bindPost(m[1]) },
	{ pattern: /^\/upload$/, render: () => renderUpload(), bind: () => bindUpload() },
	{ pattern: /^\/favorites$/, render: () => renderFavorites(), bind: () => bindFavorites() },
	{ pattern: /^\/settings$/, render: () => renderSettings(), bind: () => bindSettings() },
	{ pattern: /^\/profile$/, render: () => renderProfile(), bind: () => bindProfile() },
];

async function renderRoute(path: string): Promise<void> {
	const page = document.getElementById('page');
	if (!page) return;
	const match = routes.find((r) => r.pattern.test(path));
	if (!match) {
		page.innerHTML = `<div class="empty">404 — Página no encontrada<div class="detail"><a href="/" data-link>Volver al inicio</a></div></div>`;
		return;
	}
	const m = path.match(match.pattern)!;
	page.innerHTML = await match.render(m);
	match.bind?.(m);
}

export function navigate(path: string): void {
	history.pushState(null, '', path);
	void renderRoute(path);
}

export function initApp(): void {
	const app = document.getElementById('app');
	if (!app) return;
	renderShell();
	bindHomeGlobal();
	document.addEventListener('click', onDocLinkClick);
	window.addEventListener('popstate', () => void renderRoute(location.pathname + location.search));
	void renderRoute(location.pathname + location.search);
}

// Persistent shell: header rendered once, only main#page swaps on navigation.
function renderShell(): void {
	const app = document.getElementById('app');
	if (!app) return;
	const user = store.get().user;
	app.innerHTML = `${renderHeader(user)}<main id="page" class="site-main" tabindex="-1"></main>`;
	document.getElementById('logout-btn')?.addEventListener('click', async () => {
		await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined);
		store.set({ user: null });
		renderShell();
		void renderRoute(location.pathname + location.search);
	});
}

// Delegated link handling so re-rendered content keeps working without re-binding.
function onDocLinkClick(e: MouseEvent): void {
	if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
	const el = (e.target as Element | null)?.closest?.('a[data-link]');
	if (!el) return;
	e.preventDefault();
	const href = el.getAttribute('href');
	if (href) navigate(href);
}