// Routing propio con history.pushState — PLAN 7
type Route = { pattern: RegExp; render: (match: RegExpMatchArray) => Promise<string>; bind?: (match: RegExpMatchArray) => void };
import { renderHome, bindHome } from '../pages/home.js';
import { renderPost, bindPost } from '../pages/post.js';
import { renderUpload, bindUpload } from '../pages/upload.js';

const routes: Route[] = [
	{ pattern: /^\/$/, render: () => renderHome(), bind: () => bindHome() },
	{ pattern: /^\/post\/([^/]+)$/, render: (m) => renderPost(m[1]), bind: (m) => bindPost(m[1]) },
	{ pattern: /^\/upload$/, render: () => renderUpload(), bind: () => bindUpload() },
	{ pattern: /^\/favorites$/, render: async () => `<p>Favoritos — <a href="/" data-link>Inicio</a></p>`, bind: undefined },
	{ pattern: /^\/moderation$/, render: async () => `<p>Moderacion (solo trusted)</p>`, bind: undefined },
];

export async function navigate(path: string): Promise<void> {
	const app = document.getElementById('app');
	if (!app) return;
	for (const r of routes) {
		const m = path.match(r.pattern);
		if (m) {
			app.innerHTML = await r.render(m);
			r.bind?.(m);
			bindLinks();
			return;
		}
	}
	app.innerHTML = `<p>404 — <a href="/" data-link>Inicio</a></p>`;
	bindLinks();
}

function bindLinks(): void {
	document.querySelectorAll('[data-link]').forEach((el) => {
		el.addEventListener('click', (e) => {
			e.preventDefault();
			const href = (el as HTMLAnchorElement).getAttribute('href')!;
			history.pushState(null, '', href);
			navigate(href);
		});
	});
}

export function initRouter(): void {
	window.addEventListener('popstate', () => navigate(location.pathname + location.search));
	navigate(location.pathname + location.search);
}
