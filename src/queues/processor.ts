// =========================================================================================================
// QUEUE PROCESSOR
// =========================================================================================================
// Idempotent jobs: process_media, recalculate_post_score, update_tag_usage, cleanup_expired_sessions.
// Zero SQL inline — delegates to repositories.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { MediaRepository } from '../repositories/media-repository';
import { SessionRepository } from '../repositories/session-repository';
import type { QueueMessage } from '../types';

// =========================================================================================================
// Types
// =========================================================================================================

export type QueueEnv = Cloudflare.Env & { DB: D1Database; MEDIA_BUCKET: R2Bucket; IMAGES: ImagesBinding };

type GeneratedVariant = { name: string; format: 'webp' | 'png' | 'gif'; options?: ImageTransform; animated?: boolean };

const LOW_SIZE = { width: 175, height: 160, fit: 'scale-down' } as const;
const MEDIUM_SIZE = { width: 1600, fit: 'scale-down' } as const;
const VIDEO_SIZES = [
	{ name: 'low', height: 360 },
	{ name: 'medium', height: 720 },
	{ name: 'original', height: null },
] as const;

// =========================================================================================================
// Handler
// =========================================================================================================

export async function handleQueue(batch: MessageBatch<QueueMessage>, env: QueueEnv): Promise<void> {
	for (const msg of batch.messages) {
		const body = msg.body;

		try {
			if (body.type === 'process_media' && body.postId) {
				await processMedia(env, body.postId);
			} else if (body.type === 'recalculate_post_score' && body.postId) {
				await new MediaRepository(env.DB).recalcScoreWithDecay(body.postId);
			} else if (body.type === 'update_tag_usage') {
				await new MediaRepository(env.DB).recalcAllTagUsage();
			} else if (body.type === 'cleanup_expired_sessions') {
				await new SessionRepository(env.DB).cleanupExpired();
			}

			msg.ack();
		} catch (e) {
			console.error('queue job failed', body, e);

			msg.retry();
		}
	}
}

// =========================================================================================================
// Helpers
// =========================================================================================================

async function processMedia(env: QueueEnv, postId: number): Promise<void> {
	const db = env.DB;
	const media = new MediaRepository(db);
	const asset = await media.findAssetByPostId(postId);

	if (!asset) return;
	if (asset.processing_status === 'done') return;

	const existing = await media.findVariant(asset.id, 'low');

	if (existing) {
		await media.publishPostWithExistingVariant(postId, asset.id, existing.object_key);

		return;
	}
	if (asset.media_type === 'video') {
		await processVideo(env, media, asset.id, postId, asset.original_object_key);

		return;
	}

	const mediaPrefix = asset.original_object_key.replace(/\/original$/, '');
	const isGif = asset.media_type === 'gif';
	const lowKey = `${mediaPrefix}/low.webp`;
	const medKey = `${mediaPrefix}/medium.${isGif ? 'gif' : 'webp'}`;
	const source = await env.MEDIA_BUCKET.get(asset.original_object_key);

	if (!source) throw new Error(`missing media: ${asset.original_object_key}`);

	const sourceBytes = await source.arrayBuffer();
	const variants: GeneratedVariant[] = isGif
		? [
				{ name: 'low', format: 'webp', options: LOW_SIZE, animated: false },
				{ name: 'low', format: 'gif', options: LOW_SIZE },
				{ name: 'medium', format: 'gif', options: MEDIUM_SIZE },
			]
		: (['webp', 'png'] as const).flatMap((format): GeneratedVariant[] => [
				{ name: 'low', format, options: LOW_SIZE },
				{ name: 'medium', format, options: MEDIUM_SIZE },
				{ name: 'original', format },
			]);
	let lowByteSize = 0;
	let mediumByteSize = 0;
	for (const variant of variants) {
		const bytes = await transformImage(env.IMAGES, sourceBytes, variant.format, variant.options, variant.animated ?? true);
		await env.MEDIA_BUCKET.put(`${mediaPrefix}/${variant.name}.${variant.format}`, bytes, { httpMetadata: { contentType: `image/${variant.format}` } });
		if (variant.name === 'low' && variant.format === 'webp') lowByteSize = bytes.byteLength;
		if (variant.name === 'medium' && variant.format === (isGif ? 'gif' : 'webp')) mediumByteSize = bytes.byteLength;
	}
	const preview = await transformImage(env.IMAGES, sourceBytes, 'webp', { width: 20, height: 20, fit: 'cover', blur: 10 }, false);
	const previewData = `data:image/webp;base64,${btoa(String.fromCharCode(...new Uint8Array(preview)))}`;
	await media.insertVariantsAndPublish(asset.id, postId, lowKey, medKey, previewData, lowByteSize, mediumByteSize, isGif ? 'image/gif' : 'image/webp');
}

async function processVideo(env: QueueEnv, media: MediaRepository, assetId: number, postId: number, originalKey: string): Promise<void> {
	const prefix = originalKey.replace(/\/original$/, '');
	const posterKey = `${prefix}/poster.jpg`;
	const posterSource = await env.MEDIA_BUCKET.get(originalKey);
	if (!posterSource) throw new Error(`missing video: ${originalKey}`);
	const poster = env.MEDIA.input(posterSource.body).transform(LOW_SIZE).output({ mode: 'frame', format: 'jpg' });
	const posterObject = await env.MEDIA_BUCKET.put(posterKey, await poster.media(), { httpMetadata: { contentType: 'image/jpeg' } });
	if (!posterObject) throw new Error('unable to store video poster');

	let mediumSize = 0;
	let originalSize = 0;
	for (const { name, height } of VIDEO_SIZES) {
		const source = await env.MEDIA_BUCKET.get(originalKey);
		if (!source) throw new Error(`missing video: ${originalKey}`);
		const input = env.MEDIA.input(source.body);
		const result = (height ? input.transform({ height, fit: 'scale-down' }) : input).output({ mode: 'video' });
		const object = await env.MEDIA_BUCKET.put(`${prefix}/${name}.mp4`, await result.media(), { httpMetadata: { contentType: 'video/mp4' } });
		if (!object) throw new Error(`unable to store ${name} video`);
		if (name === 'medium') mediumSize = object.size;
		if (name === 'original') originalSize = object.size;
	}
	await media.insertVideoVariantsAndPublish(assetId, postId, posterKey, `${prefix}/medium.mp4`, `${prefix}/original.mp4`, posterObject.size, mediumSize, originalSize);
}

async function transformImage(images: ImagesBinding, bytes: ArrayBuffer, format: 'webp' | 'png' | 'gif', options?: ImageTransform, anim = true): Promise<ArrayBuffer> {
	const stream = new Response(bytes).body;
	if (!stream) throw new Error('image stream unavailable');
	const input = images.input(stream);
	const result = await (options ? input.transform(options) : input).output({ format: `image/${format}`, anim });
	return result.response().arrayBuffer();
}
