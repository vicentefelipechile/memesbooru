export function renderScore(score: number, favoriteCount: number, commentCount?: number): string {
	let html = `<span>Score ${score.toFixed(1)}</span><span>Fav ${favoriteCount}</span>`;
	if (typeof commentCount === 'number') html += `<span>Comments ${commentCount}</span>`;
	return `<div class="meta">${html}</div>`;
}
