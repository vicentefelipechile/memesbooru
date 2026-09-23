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
	CommunityListResponseSchema,
	TopResponseSchema,
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
type CreatePostInput = { title?: string | null; tags: string[]; media_type: string; file: File };
type CommentInput = { body: string; parent_id?: number | null };
type ReportInput = { target_type: string; target_id: number; reason: string };

type RequestInitWithBody = Omit<RequestInit, 'body'> & { body?: JsonValue };

const WORKER_ORIGIN = 'https://memesbooru.vicentefelipechile.workers.dev';

export function apiUrl(path: string): string {
	return location.hostname === 'memesbooru.pages.dev' ? `${WORKER_ORIGIN}${path}` : path;
}

export function loginUrl(): string {
	return `${apiUrl('/api/auth/google')}?returnTo=${encodeURIComponent(location.origin)}`;
}

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
		login: (email: string, password: string) => this.post('/api/auth/login', { email, password }, UserResponseSchema),
		register: (username: string, email: string, password: string) => this.post('/api/auth/register', { username, email, password }, UserResponseSchema),
		logout: () => this.request('/api/auth/logout', { method: 'POST' }),
		totpSetup: () => this.post('/api/auth/totp/setup', {}, TotpSetupResponseSchema),
		totpVerify: (code: string) => this.post('/api/auth/totp/verify', { code }, TotpVerifyResponseSchema),
		changeEmail: (email: string) => this.post('/api/auth/email', { email }),
		changePassword: (current_password: string, password: string) => this.post('/api/auth/password', { current_password, password }),
		updateProfile: (display_name: string | null) => this.request('/api/auth/profile', { method: 'PATCH', body: { display_name } }),
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
		random: (tags?: string) => this.getJson<{ public_id: string | null }>(`/api/posts/random${tags ? `?tags=${encodeURIComponent(tags)}` : ''}`),
		create: (input: CreatePostInput) => {
			const form = new FormData();
			form.set('file', input.file);
			form.set('tags', input.tags.join(' '));
			form.set('media_type', input.media_type);
			if (input.title) form.set('title', input.title);
			return this.upload('/api/posts', form, CreatePostResponseSchema);
		},
		videoUploadUrl: (title: string | null, tags: string[]) => this.post('/api/posts/video/upload-url', { title, tags }, undefined),
		uploadVideo: async (file: File, title: string | null, tags: string[]) => {
			const target = (await this.posts.videoUploadUrl(title, tags)) as { uploadURL: string; id: string };
			const form = new FormData();
			form.set('file', file);
			const response = await fetch(target.uploadURL, { method: 'POST', body: form });
			if (!response.ok) throw new ApiError(response.status, await response.text());
			return this.post('/api/posts/video/complete', { id: target.id, title, tags }, CreatePostResponseSchema);
		},
		rate: (publicId: string, value: number) => this.post(`/api/post/${encodeURIComponent(publicId)}/rating`, { value }),
		favorite: (publicId: string) => this.post(`/api/post/${encodeURIComponent(publicId)}/favorite`, {}),
		unfavorite: (publicId: string) => this.request(`/api/post/${encodeURIComponent(publicId)}/favorite`, { method: 'DELETE' }),
	};

	readonly tags = {
		autocomplete: (query: string) => this.get(`/api/tags/autocomplete?q=${encodeURIComponent(query)}`, AutocompleteResponseSchema),
		browse: (per = 25) => this.get(`/api/tags/browse?per=${per}`, BrowseTagsResponseSchema),
		list: (limit = 100, offset = 0) => this.get(`/api/tags/?limit=${limit}&offset=${offset}`, CommunityListResponseSchema),
		aliases: () => this.get('/api/tags/aliases', CommunityListResponseSchema),
		edit: (id: number, input: JsonValue) => this.post(`/api/tags/${id}/edit`, input),
		addAlias: (input: JsonValue) => this.post('/api/tags/aliases', input),
	};

	readonly comments = {
		recent: (limit = 50) => this.get(`/api/comments?limit=${limit}`, CommentListResponseSchema),
		list: (publicId: string) => this.get(`/api/comments/post/${encodeURIComponent(publicId)}`, CommentListResponseSchema),
		create: (publicId: string, input: CommentInput) => this.post(`/api/comments/post/${encodeURIComponent(publicId)}`, input),
	};

	readonly community = {
		artists: (limit = 50) => this.get(`/api/community/artists?limit=${limit}`, CommunityListResponseSchema),
		pools: (limit = 50) => this.get(`/api/community/pools?limit=${limit}`, CommunityListResponseSchema),
		topics: (limit = 50) => this.get(`/api/community/forum/topics?limit=${limit}`, CommunityListResponseSchema),
		wiki: (limit = 50) => this.get(`/api/community/wiki?limit=${limit}`, CommunityListResponseSchema),
		createArtist: (input: JsonValue) => this.post('/api/community/artists', input),
		createPool: (input: JsonValue) => this.post('/api/community/pools', input),
		createTopic: (input: JsonValue) => this.post('/api/community/forum/topics', input),
		createWiki: (input: JsonValue) => this.post('/api/community/wiki', input),
		createReply: (input: JsonValue) => this.post('/api/community/forum/replies', input),
		createContact: (input: JsonValue) => this.post('/api/community/contact', input),
		createMail: (input: JsonValue) => this.post('/api/community/mail', input),
		mail: (limit = 50) => this.get(`/api/community/mail?limit=${limit}`, CommunityListResponseSchema),
		categories: () => this.get('/api/community/forum/categories', CommunityListResponseSchema),
		topic: (id: number) => this.getJson(`/api/community/forum/topics/${id}`),
		topicPosts: (id: number) => this.get(`/api/community/forum/topics/${id}/posts`, CommunityListResponseSchema),
		editForumPost: (input: JsonValue) => this.request('/api/community/forum/posts', { method: 'PATCH', body: input }),
	};

	readonly top = (limit = 100, period = 'all', sort = 'score') => this.get(`/api/posts/top?limit=${limit}&period=${period}&sort=${sort}`, TopResponseSchema);

	readonly favorites = {
		list: (cursor?: string) => this.get(`/api/favorites?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, FavoritesResponseSchema),
	};

	readonly moderation = {
		report: (input: ReportInput) => this.post('/api/moderation/reports', input),
		reports: () => this.get('/api/moderation/reports', CommunityListResponseSchema),
		action: (input: JsonValue) => this.post('/api/moderation/actions', input),
	};

	private async request(path: string, init: RequestInitWithBody = {}): Promise<JsonValue> {
		const { body, ...options } = init;
		const response = await fetch(apiUrl(path), {
			...options,
			credentials: 'include',
			headers: body === undefined ? options.headers : { 'content-type': 'application/json', ...options.headers },
			body: body === undefined ? undefined : JSON.stringify(body),
		});

		if (!response.ok) throw new ApiError(response.status, await response.text());

		return response.json() as Promise<JsonValue>;
	}

	private async upload<T extends JsonValue>(path: string, body: FormData, schema: { safeParse: (value: JsonValue) => { success: true; data: T } | { success: false } }): Promise<T> {
		const response = await fetch(apiUrl(path), { method: 'POST', credentials: 'include', body });
		if (!response.ok) throw new ApiError(response.status, await response.text());
		return this.parse(path, schema, (await response.json()) as JsonValue);
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
