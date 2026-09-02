// =========================================================================================================
// SCORE (v2)
// Compact booru text line: Score / Favs / Comments. No overlay box.
// =========================================================================================================

export function renderScore(score: number, favoriteCount: number, commentCount?: number): string {
	const parts = [`Score ${score.toFixed(1)}`, `Favs ${favoriteCount}`];
	if (typeof commentCount === 'number') parts.push(`Comments ${commentCount}`);
	return `<span class="score">${parts.join(' · ')}</span>`;
}