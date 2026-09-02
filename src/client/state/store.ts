// =========================================================================================================
// STORE (v2)
// Small explicit state: search query, tags, sort, theme, and page↔cursor history for booru pagination.
// =========================================================================================================

export type ThemeName = 'android' | 'solarized' | 'gruvbox' | 'nord';
export const THEMES: readonly ThemeName[] = ['android', 'solarized', 'gruvbox', 'nord'];

const THEME_KEY = 'memesbooru.theme';

type State = {
	user: { id: number; username: string; rank: string; display_name?: string | null; status?: string } | null;
	query: string;
	sort: 'recent' | 'popular';
	tags: string[];
	theme: ThemeName;
	// page -> cursor (page 1 is the first request, cursor 1 = nextCursor from page 1)
	pages: { cursor: string | null }[];
	currentPage: number;
	hasMore: boolean;
};

function readTheme(): ThemeName {
	const stored = localStorage.getItem(THEME_KEY);
	if (stored && (THEMES as readonly string[]).includes(stored)) return stored as ThemeName;
	return 'android';
}

let state: State = { user: null, query: '', sort: 'recent', tags: [], theme: readTheme(), pages: [], currentPage: 1, hasMore: false };
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
	state = { ...state, pages: [], currentPage: 1, hasMore: false };
}

export function recordPage(cursor: string | null): void {
	state = { ...state, pages: [...state.pages, { cursor }] };
}

export function cursorForPage(page: number): string | null {
	if (page < 1) return null;
	if (page === 1) return null;
	const rec = state.pages[page - 2];
	return rec?.cursor ?? null;
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