import { HealthResponseSchema, SearchResponseSchema, PostResponseSchema, AutocompleteResponseSchema, UserResponseSchema, CreatePostResponseSchema, CommentListResponseSchema } from '../../validators';
import type { JsonValue } from '../../types';

export async function apiGet(path: string): Promise<JsonValue> {
	const res = await fetch(path, { credentials: 'include' });
	if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
	return (await res.json()) as JsonValue;
}
export async function apiPost(path: string, body: JsonValue): Promise<JsonValue> {
	const res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
	if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
	return (await res.json()) as JsonValue;
}

export async function getHealth() {
	const raw = await apiGet('/api/health');
	const parsed = HealthResponseSchema.safeParse(raw);
	if (!parsed.success) throw new Error('invalid health response');
	return parsed.data;
}
export async function searchPosts(params: { tags?: string; sort?: string; cursor?: string; limit?: number }) {
	const q = new URLSearchParams();
	if (params.tags) q.set('tags', params.tags);
	if (params.sort) q.set('sort', params.sort);
	if (params.cursor) q.set('cursor', params.cursor);
	if (params.limit) q.set('limit', String(params.limit));
	const raw = await apiGet(`/api/posts?${q}`);
	const parsed = SearchResponseSchema.safeParse(raw);
	if (!parsed.success) return { data: [], nextCursor: null };
	return parsed.data;
}
export async function getPost(publicId: string) {
	const raw = await apiGet(`/api/posts/${publicId}`);
	const parsed = PostResponseSchema.safeParse(raw);
	if (!parsed.success) return null;
	return parsed.data;
}
export async function autocompleteTags(q: string) {
	const raw = await apiGet(`/api/tags/autocomplete?q=${encodeURIComponent(q)}`);
	const parsed = AutocompleteResponseSchema.safeParse(raw);
	if (!parsed.success) return { tags: [] };
	return parsed.data;
}
export async function getMe() {
	const raw = await apiGet('/api/auth/me');
	const parsed = UserResponseSchema.safeParse(raw);
	if (!parsed.success) return { user: null };
	return parsed.data;
}
export async function createPostApi(body: { title?: string | null; tags: string[]; mediaType: string }) {
	const raw = await apiPost('/api/posts', body);
	const parsed = CreatePostResponseSchema.safeParse(raw);
	if (!parsed.success) throw new Error('invalid create response');
	return parsed.data;
}
export async function getComments(publicId: string) {
	const raw = await apiGet(`/api/comments/post/${publicId}`);
	const parsed = CommentListResponseSchema.safeParse(raw);
	if (!parsed.success) return { data: [] };
	return parsed.data;
}
