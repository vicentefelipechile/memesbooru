export type GridItem = { public_id: string; low_variant_key: string; score: number; favorite_count: number; tags?: string[] };

export function renderGrid(items: GridItem[]): string {
  if (items.length === 0) return `<div class="empty">No hay publicaciones. Prueba otros tags.</div>`;
  return `<div class="grid">
    ${items.map((p) => `
      <a href="/post/${p.public_id}" data-link class="card">
        <div class="thumb" style="background:#1a1a1a">
          <img loading="lazy" src="/api/posts/${p.public_id}/variants/low" alt="${(p.tags ?? []).join(" ")}" onerror="this.style.display='none'" />
        </div>
        <div class="meta"><span>★ ${p.score.toFixed(1)}</span><span>♥ ${p.favorite_count}</span></div>
      </a>`).join("")}
  </div>`;
}
export function renderCursor(nextCursor: string | null): string {
  return nextCursor ? `<button id="load-more" data-cursor="${nextCursor}" class="load-more">Cargar mas</button>` : `<span class="end">Fin</span>`;
}
