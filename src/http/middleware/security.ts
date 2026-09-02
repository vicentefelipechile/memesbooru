// =========================================================================================================
// SECURITY MIDDLEWARE (v2)
// =========================================================================================================
// secureHeaders + cors + csrf with explicit allowlist. No * except public docs.
// =========================================================================================================

import type { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import { cors } from 'hono/cors';
import { csrf } from 'hono/csrf';

export function securityMiddleware(app: Hono<{ Bindings: Env }>) {
	app.use(
		secureHeaders({
			contentSecurityPolicy: {
				defaultSrc: ["'self'"],
				scriptSrc: ["'self'", 'https:', 'https://challenges.cloudflare.com'],
				styleSrc: ["'self'", 'https:', "'unsafe-inline'"],
				imgSrc: ["'self'", 'https:', 'data:', 'blob:'],
				mediaSrc: ["'self'", 'https:', 'blob:'],
				connectSrc: ["'self'", 'https:'],
				frameSrc: ['https://challenges.cloudflare.com'],
			},
		}),
	);

	app.use(
		'/api/*',
		cors({
			origin: (origin) => {
				const allowlist = ['http://localhost:5173', 'http://127.0.0.1:5173'];
				if (!origin) return origin;
				if (allowlist.includes(origin)) return origin;
				return null;
			},
			allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
			allowHeaders: ['Content-Type', 'Authorization'],
			credentials: true,
		}),
	);

	app.use(
		'/api/*',
		csrf({
			origin: (origin) => {
				if (!origin) return true;
				const allowlist = ['http://localhost:5173', 'http://127.0.0.1:5173'];
				if (allowlist.includes(origin)) return true;
				try {
					const url = new URL(origin);
					if (url.hostname === 'localhost' || url.hostname === '127.0.0.1' || url.hostname === '::1') return true;
				} catch {}
				return false;
			},
		}),
	);
}
