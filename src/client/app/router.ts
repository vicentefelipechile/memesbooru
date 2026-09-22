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
import { renderRandom, bindRandom } from '../pages/random.js';
import { api } from '../services/api.js';

const routes: Route[] = [
	{ pattern: /^\/(\?.*)?$/, render: () => renderHome(), bind: () => bindHome() },
	{ pattern: /^\/post\/([^/]+)$/, render: (m) => renderPost(m[1]), bind: (m) => bindPost(m[1]) },
	{ pattern: /^\/upload$/, render: () => renderUpload(), bind: () => bindUpload() },
	{ pattern: /^\/favorites$/, render: () => renderFavorites(), bind: () => bindFavorites() },
	{ pattern: /^\/settings$/, render: () => renderSettings(), bind: () => bindSettings() },
	{ pattern: /^\/profile$/, render: () => renderProfile(), bind: () => bindProfile() },
	{ pattern: /^\/random$/, render: () => renderRandom(), bind: () => bindRandom() },
];

let routeVersion = 0;

async function renderRoute(path: string): Promise<void> {
	const version = ++routeVersion;
	const page = document.getElementById('page');

	if (!page) return;

	const pathname = new URL(path, location.origin).pathname;
	const match = routes.find((r) => r.pattern.test(pathname));
	updateNavigation(pathname);

	if (!match) {
		page.innerHTML = `<div class="empty">404 — Página no encontrada<div class="detail"><a href="/" data-link>Volver al inicio</a></div></div>`;

		return;
	}

	const m = pathname.match(match.pattern)!;

	try {
		const html = await match.render(m);

		if (version !== routeVersion) return;

		page.innerHTML = html;
		match.bind?.(m);
	} catch (error) {
		console.error('Route failed', error);

		if (version === routeVersion) page.innerHTML = '<div class="error" role="alert">No se pudo cargar la página. <a href="/" data-link>Volver a intentar</a></div>';
	}
}

function updateNavigation(pathname: string): void {
	for (const link of Array.from(document.querySelectorAll<HTMLAnchorElement>('.site-nav a[data-link], .site-subnav a[data-link]'))) {
		const active = link.pathname === pathname || (link.pathname === '/' && pathname.startsWith('/post/'));

		if (active) link.setAttribute('aria-current', 'page');
		else link.removeAttribute('aria-current');
	}
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
		await api.auth.logout().catch(() => undefined);

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
