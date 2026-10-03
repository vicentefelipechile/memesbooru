// =========================================================================================================
// Media variant delivery from R2 and video transformation boundaries.
// =========================================================================================================

import { env } from 'cloudflare:test';
import { Hono } from 'hono';
import { beforeAll, describe, expect, it } from 'vitest';

import { DomainError } from '../../src/domain/errors';
import postRoutes from '../../src/http/routes/posts';
import { mp4DurationMs } from '../../src/helpers/file-validation';
import { hashToken } from '../../src/helpers/crypto';
import { handleQueue } from '../../src/queues/processor';
import { toPostId, type QueueMessage } from '../../src/types';
import { applySchema } from './apply-schema';

beforeAll(async () => {
	await applySchema(env.DB);
	await env.DB.prepare("INSERT INTO users (id, username, created_at) VALUES (1, 'author', 1)").run();
	await env.DB.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (1, 1)').run();
	await env.DB.prepare('INSERT INTO sessions (id, user_id, token_hash, created_at, expires_at, last_seen_at) VALUES (1, 1, ?, 1, ?, 1)').bind(await hashToken('test-video-session'), Date.now() + 100000).run();
	await env.DB.prepare("INSERT INTO posts (id, public_id, author_id, media_type, status, created_at, updated_at) VALUES (1, 'picture', 1, 'image', 'available', 1, 1), (2, 'motion', 1, 'gif', 'available', 1, 1)").run();
	await env.DB.prepare("INSERT INTO posts (id, public_id, author_id, media_type, status, created_at, updated_at) VALUES (5, 'legacy', 1, 'image', 'available', 1, 1)").run();
	await env.DB.prepare("INSERT INTO post_listing (post_id, public_id, media_type, status, low_variant_key, medium_variant_key, published_at) VALUES (1, 'picture', 'image', 'available', 'media/picture/low.webp', 'media/picture/medium.webp', 1), (2, 'motion', 'gif', 'available', 'media/motion/low.webp', 'media/motion/medium.gif', 1)").run();
	await env.DB.prepare("INSERT INTO post_listing (post_id, public_id, media_type, status, low_variant_key, medium_variant_key, published_at) VALUES (5, 'legacy', 'image', 'available', 'media/legacy/low.avif', 'media/legacy/medium.avif', 1)").run();
	await env.MEDIA_BUCKET.put('media/legacy/low.avif', 'old thumbnail', { httpMetadata: { contentType: 'image/avif' } });
	for (const name of ['low.webp', 'low.png', 'medium.webp', 'medium.png', 'original.webp', 'original.png']) await env.MEDIA_BUCKET.put(`media/picture/${name}`, name, { httpMetadata: { contentType: `image/${name.split('.')[1]}` } });
	for (const name of ['low.webp', 'low.gif', 'medium.gif']) await env.MEDIA_BUCKET.put(`media/motion/${name}`, name, { httpMetadata: { contentType: `image/${name.split('.')[1]}` } });
	await env.MEDIA_BUCKET.put('media/motion/original', 'original gif', { httpMetadata: { contentType: 'image/gif' } });
});

describe('media variants', () => {
	const app = new Hono<{ Bindings: Env }>();
	app.onError((error, c) => error instanceof DomainError ? c.json({ error: error.message }, error.status) : c.json({ error: 'Unexpected' }, 500));
	app.route('/', postRoutes);
	const request = (path: string) => app.fetch(new Request(`http://localhost/${path}`), env, {} as ExecutionContext);
	const videoRequest = (path: string, range?: string) => app.fetch(new Request(`http://localhost/${path}`, { headers: { cookie: 'session=test-video-session', ...(range ? { Range: range } : {}) } }), env, {} as ExecutionContext);

	it('serves each image size in WebP and PNG', async () => {
		for (const name of ['low.webp', 'low.png', 'medium.webp', 'medium.png', 'original.webp', 'original.png']) {
			const [size, format] = name.split('.');
			const response = await request(`picture/variants/${size}?format=${format}`);
			expect(response.status).toBe(200);
			expect(response.headers.get('Content-Type')).toBe(`image/${format}`);
			expect(await response.text()).toBe(name);
		}
	});

	it('serves a static WebP thumbnail and animated GIF sizes', async () => {
		for (const [path, body] of [['low', 'low.webp'], ['low?format=gif', 'low.gif'], ['medium', 'medium.gif'], ['original?format=gif', 'original gif']]) {
			const response = await request(`motion/variants/${path}`);
			expect(response.status).toBe(200);
			expect(await response.text()).toBe(body);
		}
	});

	it('rejects formats that are not generated for a media type', async () => {
		expect((await request('motion/variants/medium?format=png')).status).toBe(400);
		expect((await request('picture/variants/low?format=gif')).status).toBe(400);
	});

	it('continues serving existing AVIF thumbnails', async () => {
		const response = await request('legacy/variants/low');
		expect(response.status).toBe(200);
		expect(await response.text()).toBe('old thumbnail');
	});

	it('generates both image formats and the GIF exception before publishing', async () => {
		const calls: { format: string; animated: boolean; width?: number }[] = [];
		const images = {
			input() {
				const output = (options: { format: string; anim: boolean }) => {
					calls.push({ format: options.format, animated: options.anim, width: size?.width });
					return Promise.resolve({ response: () => new Response('encoded') });
				};
				let size: ImageTransform | undefined;
				return { transform(options: ImageTransform) { size = options; return this; }, output };
			},
		} as ImagesBinding;
		await env.DB.prepare("INSERT INTO posts (id, public_id, author_id, media_type, status, created_at, updated_at) VALUES (3, 'generated-image', 1, 'image', 'processing', 1, 1), (4, 'generated-gif', 1, 'gif', 'processing', 1, 1)").run();
		await env.DB.prepare("INSERT INTO media_assets (id, post_id, media_type, original_object_key, mime_type, byte_size, checksum, processing_status, created_at) VALUES (3, 3, 'image', 'media/generated-image/original', 'image/png', 4, X'01', 'pending', 1), (4, 4, 'gif', 'media/generated-gif/original', 'image/gif', 4, X'02', 'pending', 1)").run();
		for (const id of ['generated-image', 'generated-gif']) await env.MEDIA_BUCKET.put(`media/${id}/original`, 'source');
		for (const id of [3, 4]) {
			let retried = false;
			const batch = { messages: [{ body: { type: 'process_media', postId: toPostId(id) }, ack() {}, retry() { retried = true; } }] } as MessageBatch<QueueMessage>;
			await handleQueue(batch, { ...env, IMAGES: images });
			expect(retried).toBe(false);
		}
		for (const name of ['low.webp', 'low.png', 'medium.webp', 'medium.png', 'original.webp', 'original.png']) expect(await (await env.MEDIA_BUCKET.get(`media/generated-image/${name}`))?.text()).toBe('encoded');
		for (const name of ['low.webp', 'low.gif', 'medium.gif']) expect(await (await env.MEDIA_BUCKET.get(`media/generated-gif/${name}`))?.text()).toBe('encoded');
		expect(calls).toContainEqual({ format: 'image/webp', animated: false, width: 175 });
		expect(calls).toContainEqual({ format: 'image/gif', animated: true, width: 175 });
		expect(await env.DB.prepare("SELECT preview_data FROM post_listing WHERE public_id = 'generated-gif'").first()).toMatchObject({ preview_data: expect.stringMatching(/^data:image\/webp;base64,/) });
	});

	it('generates three MP4 resolutions and a poster in R2, then supports ranged playback', async () => {
		const calls: { mode: string; width?: number; height?: number }[] = [];
		const media = {
			input(source: ReadableStream) {
				let size: MediaTransformationInputOptions = {};
				return {
					transform(options: MediaTransformationInputOptions) { size = options; return this; },
					output(options: MediaTransformationOutputOptions) {
						calls.push({ mode: options.mode ?? '', width: size.width, height: size.height });
						return { media: async () => { await new Response(source).arrayBuffer(); return new Response(options.mode === 'frame' ? 'poster' : 'encoded-mp4').body; } };
					},
				};
			},
		} as MediaBinding;
		await env.DB.prepare("INSERT INTO posts (id, public_id, author_id, media_type, status, created_at, updated_at) VALUES (6, 'generated-video', 1, 'video', 'processing', 1, 1)").run();
		await env.DB.prepare("INSERT INTO media_assets (id, post_id, media_type, original_object_key, mime_type, byte_size, checksum, processing_status, created_at) VALUES (6, 6, 'video', 'media/generated-video/original', 'video/mp4', 4, X'06', 'pending', 1)").run();
		await env.MEDIA_BUCKET.put('media/generated-video/original', 'source');
		let retried = false;
		const batch = { messages: [{ body: { type: 'process_media', postId: toPostId(6) }, ack() {}, retry() { retried = true; } }] } as MessageBatch<QueueMessage>;
		await handleQueue(batch, { ...env, MEDIA: media });
		expect(retried).toBe(false);
		expect(calls).toEqual([{ mode: 'frame', width: 175, height: 160 }, { mode: 'video', width: undefined, height: 360 }, { mode: 'video', width: undefined, height: 720 }, { mode: 'video', width: undefined, height: undefined }]);
		for (const name of ['low.mp4', 'medium.mp4', 'original.mp4']) expect(await (await env.MEDIA_BUCKET.get(`media/generated-video/${name}`))?.text()).toBe('encoded-mp4');
		expect((await request('generated-video/variants/medium')).status).toBe(403);
		const publicPoster = await request('generated-video/variants/low');
		expect(publicPoster.status).toBe(200);
		expect(await publicPoster.text()).toBe('poster');
		const poster = await videoRequest('generated-video/variants/low');
		expect(poster.headers.get('Content-Type')).toBe('image/jpeg');
		expect(await poster.text()).toBe('poster');
		const clip = await videoRequest('generated-video/variants/medium', 'bytes=0-6');
		expect(clip.status).toBe(206);
		expect(clip.headers.get('Content-Range')).toBe('bytes 0-6/11');
		expect(clip.headers.get('Cache-Control')).toBe('private, no-store');
		expect(await clip.text()).toBe('encoded');
	});

	it('rejects MP4 uploads that would be silently truncated', async () => {
		const box = (type: string, payload: Uint8Array) => {
			const bytes = new Uint8Array(payload.length + 8);
			new DataView(bytes.buffer).setUint32(0, bytes.length);
			bytes.set(new TextEncoder().encode(type), 4);
			bytes.set(payload, 8);
			return bytes;
		};
		const movie = new Uint8Array(20);
		const view = new DataView(movie.buffer);
		view.setUint32(12, 1000);
		view.setUint32(16, 60_000);
		expect(mp4DurationMs(box('moov', box('mvhd', movie)))).toBe(60_000);
		view.setUint32(16, 61_000);
		const tooLong = box('moov', box('mvhd', movie));
		expect(mp4DurationMs(tooLong)).toBe(61_000);
		expect(mp4DurationMs(box('moov', box('junk', movie)))).toBeNull();
		const form = new FormData();
		form.set('title', 'Long video');
		form.set('media_type', 'video');
		form.set('tags', 'video');
		form.set('file', new File([tooLong], 'video.mp4', { type: 'video/mp4' }));
		const response = await app.fetch(new Request('http://localhost/', { method: 'POST', headers: { cookie: 'session=test-video-session' }, body: form }), env, {} as ExecutionContext);
		expect(response.status).toBe(400);
		expect(await response.text()).toContain('60 segundos');
	});
});
