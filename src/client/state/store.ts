// =========================================================================================================
// STORE (v2)
// Small explicit state: search query, tags, sort, theme, and page↔cursor history for booru pagination.
// =========================================================================================================

export type ThemeName = 'cyan' | 'solarized' | 'gruvbox' | 'nord';
export const THEMES: readonly ThemeName[] = ['cyan', 'solarized', 'gruvbox', 'nord'];

const THEME_KEY = 'memesbooru.theme';

type State = {
	user: { id: number; username: string; rank: string; display_name?: string | null; status?: string } | null;
	query: string;
	sort: 'recent' | 'popular';
	tags: string[];
	theme: ThemeName;
	// page -> cursor (page 1 is the first request, cursor 1 = nextCursor from page 1)
	pages: Record<number, { cursor: string | null }>;
	currentPage: number;
	hasMore: boolean;
};

function readTheme(): ThemeName {
	const stored = localStorage.getItem(THEME_KEY);
	if (stored && (THEMES as readonly string[]).includes(stored)) return stored as ThemeName;
	return 'cyan';
}

let state: State = { user: null, query: '', sort: 'recent', tags: [], theme: readTheme(), pages: {}, currentPage: 1, hasMore: false };
const listeners = new Set<() => void>();

export function applyTheme(): void {
	document.documentElement.dataset.theme = state.theme;
}

export function setTheme(theme: ThemeName): void {
	state = { ...state, theme };
	localStorage.setItem(THEME_KEY, theme);
	applyTheme();
	listeners.forEach((l) => l());
}

// Cursor pagination bookkeeping — page 1 has no cursor, subsequent pages use recorded cursors.
export function resetPagination(): void {
	state = { ...state, pages: {}, currentPage: 1, hasMore: false };
}

export function recordPage(page: number, cursor: string | null): void {
	const pages = Object.fromEntries(Object.entries(state.pages).filter(([index]) => Number(index) < page));
	pages[page - 1] = { cursor };
	state = { ...state, pages };
}

export function cursorForPage(page: number): string | null | undefined {
	if (!Number.isSafeInteger(page) || page < 1) return undefined;
	if (page === 1) return null;
	const rec = state.pages[page - 2];
	return rec?.cursor ?? undefined;
}

export function setCurrentPage(page: number): void {
	state = { ...state, currentPage: page };
	listeners.forEach((l) => l());
}

export function setHasMore(hasMore: boolean): void {
	state = { ...state, hasMore };
}

export const store = {
	get(): State {
		return { ...state };
	},
	set(patch: Partial<State>) {
		state = { ...state, ...patch };
		listeners.forEach((l) => l());
	},
	subscribe(fn: () => void) {
		listeners.add(fn);
		return () => listeners.delete(fn);
	},
};
