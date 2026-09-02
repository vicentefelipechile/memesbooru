import { renderHeader } from "../components/header.js";
import { getMe } from "../services/api.js";
export async function renderUpload(): Promise<string> {
  const { user } = await getMe().catch(() => ({ user: null }));
  if (!user) return `${renderHeader(null)}<main class="page"><p>Necesitas login con Google para subir.</p><a href="/api/auth/google">Login</a></main>`;
  return `
    ${renderHeader(user)}
    <main class="page">
      <h1>Subir meme</h1>
      <form id="upload-form">
        <input type="file" id="file" accept="image/*,video/mp4,video/webm,image/gif" required />
        <input id="title" placeholder="Titulo (opcional)" maxlength="120" />
        <input id="tags" placeholder="tags separados por espacio: pepe doge reaccion" required />
        <select id="mediaType"><option value="image">Imagen</option><option value="gif">GIF</option><option value="video">Video (solo trusted)</option></select>
        <button>Subir</button>
      </form>
      <div id="upload-status"></div>
      <p class="hint">Cooldownd: cuentas nuevas 1 subida/hora. Videos solo trusted. Original se conserva, se generan variantes low/medium.</p>
    </main>`;
}
export function bindUpload(): void {
  document.getElementById("upload-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const tags = (document.getElementById("tags") as HTMLInputElement).value.trim().split(/\s+/);
    const mediaType = (document.getElementById("mediaType") as unknown as HTMLSelectElement).value;
    const title = (document.getElementById("title") as HTMLInputElement).value;
    const status = document.getElementById("upload-status")!;
    status.textContent = "Subiendo...";
    const res = await fetch("/api/posts", { method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify({ title, tags, mediaType }) });
    if (!res.ok) status.textContent = `Error: ${await res.text()}`;
    else {
      const j = await res.json() as { publicId: string };
      status.textContent = `Creado ${j.publicId} — en procesamiento (variant low). Redirigiendo...`;
      setTimeout(() => location.assign(`/post/${j.publicId}`), 800);
    }
  });
}
