// Estado pequeno y explicito — PLAN 7 sin frameworks
type State = {
	user: { id: number; username: string; rank: string } | null;
	query: string;
	sort: 'recent' | 'popular';
	tags: string[];
};

let state: State = { user: null, query: '', sort: 'recent', tags: [] };
const listeners = new Set<() => void>();

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
