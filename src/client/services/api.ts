type Paginated<T> = { data: T[]; nextCursor: string | null; hasMore: boolean };

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "include" });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}
export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export function getHealth() { return apiGet<{ status: string; db: string }>("/api/health"); }
export function searchPosts(params: { tags?: string; sort?: string; cursor?: string; limit?: number }) {
  const q = new URLSearchParams();
  if (params.tags) q.set("tags", params.tags);
  if (params.sort) q.set("sort", params.sort);
  if (params.cursor) q.set("cursor", params.cursor);
  if (params.limit) q.set("limit", String(params.limit));
  return apiGet<Paginated<unknown>>(`/api/posts?${q}`);
}
export function getPost(publicId: string) { return apiGet<unknown>(`/api/posts/${publicId}`); }
export function autocompleteTags(q: string) { return apiGet<{ tags: { name: string }[] }>(`/api/tags/autocomplete?q=${encodeURIComponent(q)}`); }
export function getMe() { return apiGet<{ user: { id: number; username: string; rank: string } | null }>("/api/auth/me"); }
