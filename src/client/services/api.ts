// =========================================================================================================
// MEMESBOORU API CLIENT
// =========================================================================================================
// One typed gateway for every frontend request. Views do not know HTTP details.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import {
	AutocompleteResponseSchema,
	BrowseTagsResponseSchema,
	CommentListResponseSchema,
	CreatePostResponseSchema,
	FavoritesResponseSchema,
	HealthResponseSchema,
	PostResponseSchema,
	SearchResponseSchema,
	TotpSetupResponseSchema,
	TotpVerifyResponseSchema,
	UserResponseSchema,
} from '../../validators';
import type { JsonValue } from '../../types';

// =========================================================================================================
// Types
// =========================================================================================================

type SearchParams = { tags?: string; sort?: string; cursor?: string; limit?: number };
type CreatePostInput = { title?: string | null; tags: string[]; media_type: string };
type CommentInput = { body: string; parent_id?: number | null };
type ReportInput = { target_type: string; target_id: number; reason: string };

type RequestInitWithBody = Omit<RequestInit, 'body'> & { body?: JsonValue };

// =========================================================================================================
// Errors
// =========================================================================================================

export class ApiError extends Error {
	readonly status: number;

	constructor(status: number, message: string) {
		super(message);
		this.name = 'ApiError';
		this.status = status;
	}
}

// =========================================================================================================
// Client
// =========================================================================================================

export class MemesBooruApi {
	readonly health = {
		get: () => this.get('/api/health', HealthResponseSchema),
	};

	readonly auth = {
		me: () => this.get('/api/auth/me', UserResponseSchema),
		logout: () => this.request('/api/auth/logout', { method: 'POST' }),
		totpSetup: () => this.post('/api/auth/totp/setup', {}, TotpSetupResponseSchema),
		totpVerify: (code: string) => this.post('/api/auth/totp/verify', { code }, TotpVerifyResponseSchema),
	};

	readonly posts = {
		find: async (params: SearchParams = {}) => {
			const query = new URLSearchParams();

			if (params.tags) query.set('tags', params.tags);
			if (params.sort) query.set('sort', params.sort);
			if (params.cursor) query.set('cursor', params.cursor);
			if (params.limit) query.set('limit', String(params.limit));

			return this.get(`/api/posts?${query}`, SearchResponseSchema);
		},
		get: (publicId: string) => this.get(`/api/posts/${encodeURIComponent(publicId)}`, PostResponseSchema),
		random: () => this.getJson<{ public_id: string | null }>('/api/posts/random'),
		create: (input: CreatePostInput) => this.post('/api/posts', input, CreatePostResponseSchema),
		rate: (publicId: string, value: number) => this.post(`/api/post/${encodeURIComponent(publicId)}/rating`, { value }),
		favorite: (publicId: string) => this.post(`/api/post/${encodeURIComponent(publicId)}/favorite`, {}),
		unfavorite: (publicId: string) => this.request(`/api/post/${encodeURIComponent(publicId)}/favorite`, { method: 'DELETE' }),
	};

	readonly tags = {
		autocomplete: (query: string) => this.get(`/api/tags/autocomplete?q=${encodeURIComponent(query)}`, AutocompleteResponseSchema),
		browse: (per = 25) => this.get(`/api/tags/browse?per=${per}`, BrowseTagsResponseSchema),
	};

	readonly comments = {
		list: (publicId: string) => this.get(`/api/comments/post/${encodeURIComponent(publicId)}`, CommentListResponseSchema),
		create: (publicId: string, input: CommentInput) => this.post(`/api/comments/post/${encodeURIComponent(publicId)}`, input),
	};

	readonly favorites = {
		list: () => this.get('/api/favorites', FavoritesResponseSchema),
	};

	readonly moderation = {
		report: (input: ReportInput) => this.post('/api/moderation/reports', input),
	};

	private async request(path: string, init: RequestInitWithBody = {}): Promise<JsonValue> {
		const { body, ...options } = init;
		const response = await fetch(path, {
			...options,
			credentials: 'include',
			headers: body === undefined ? options.headers : { 'content-type': 'application/json', ...options.headers },
			body: body === undefined ? undefined : JSON.stringify(body),
		});

		if (!response.ok) throw new ApiError(response.status, await response.text());

		return response.json() as Promise<JsonValue>;
	}

	private async get<T extends JsonValue>(path: string, schema: { safeParse: (value: JsonValue) => { success: true; data: T } | { success: false } }): Promise<T> {
		return this.parse(path, schema, await this.request(path));
	}

	private async getJson<T extends JsonValue>(path: string): Promise<T> {
		return (await this.request(path)) as T;
	}

	private async post<T extends JsonValue>(path: string, body: JsonValue, schema?: { safeParse: (value: JsonValue) => { success: true; data: T } | { success: false } }): Promise<T> {
		const raw = await this.request(path, { method: 'POST', body });

		return schema ? this.parse(path, schema, raw) : (raw as T);
	}

	private parse<T extends JsonValue>(path: string, schema: { safeParse: (value: JsonValue) => { success: true; data: T } | { success: false } }, raw: JsonValue): T {
		const parsed = schema.safeParse(raw);

		if (!parsed.success) throw new ApiError(502, `Invalid response from ${path}`);

		return parsed.data;
	}
}

export const api = new MemesBooruApi();
