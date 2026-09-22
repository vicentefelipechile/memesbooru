import '../styles/index.css';
import { applyTheme, store } from '../state/store.js';
import { api } from '../services/api.js';
import { initApp } from './router.js';

async function boot(): Promise<void> {
	applyTheme();
	const { user } = await api.auth.me().catch(() => ({ user: null }));
	store.set({ user });
	initApp();
}

void boot();
