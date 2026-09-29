// =========================================================================================================
// TURNSTILE WIDGET
// =========================================================================================================
// Explicit rendering survives SPA navigation and resets single-use tokens after a request.
// =========================================================================================================

// =========================================================================================================
// Types
// =========================================================================================================

type TurnstileApi = {
	render: (element: HTMLElement, options: { sitekey: string; action: 'login' | 'signup'; language: string; callback: (token: string) => void; 'expired-callback': () => void; 'error-callback': () => void }) => string;
	reset: (id: string) => void;
	remove: (id: string) => void;
};

declare global {
	interface Window {
		turnstile?: TurnstileApi;
	}
}

export type TurnstileWidget = { token: () => string; reset: () => void };

// =========================================================================================================
// Helpers
// =========================================================================================================

let scriptPromise: Promise<void> | null = null;
let activeWidget: string | null = null;

function loadScript(): Promise<void> {
	if (window.turnstile) return Promise.resolve();
	if (scriptPromise) return scriptPromise;

	scriptPromise = new Promise<void>((resolve, reject) => {
		const script = document.createElement('script');
		script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
		script.async = true;
		script.onload = () => (window.turnstile ? resolve() : reject(new Error('Turnstile unavailable')));
		script.onerror = () => reject(new Error('Turnstile unavailable'));
		document.head.appendChild(script);
	}).catch((error: Error) => {
		scriptPromise = null;
		throw error;
	});

	return scriptPromise;
}

// =========================================================================================================
// Widget
// =========================================================================================================

export async function mountTurnstile(form: HTMLFormElement, siteKey: string, action: 'login' | 'signup'): Promise<TurnstileWidget | null> {
	await loadScript();
	const container = form.querySelector<HTMLElement>('[data-turnstile]');
	if (!form.isConnected || !container || !window.turnstile) return null;

	if (activeWidget) window.turnstile.remove(activeWidget);
	let value = '';
	const id = window.turnstile.render(container, {
		sitekey: siteKey,
		action,
		language: 'es',
		callback: (token) => {
			value = token;
		},
		'expired-callback': () => {
			value = '';
		},
		'error-callback': () => {
			value = '';
		},
	});
	activeWidget = id;

	return {
		token: () => value,
		reset: () => {
			value = '';
			if (form.isConnected && activeWidget === id) window.turnstile?.reset(id);
		},
	};
}
