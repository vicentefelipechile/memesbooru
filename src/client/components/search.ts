export function renderSearch(query: string, tags: string[]): string {
  return `
  <div class="search-box">
    <input id="tag-input" placeholder="Buscar tags: pepe doge programacion..." value="${query}" autocomplete="off" />
    <div id="autocomplete" class="autocomplete"></div>
    <div class="selected-tags">${tags.map((t) => `<span class="tag">${t} <button data-remove="${t}">x</button></span>`).join("")}</div>
    <div class="sort">
      <button data-sort="recent">Recientes</button>
      <button data-sort="popular">Populares</button>
    </div>
  </div>`;
}
