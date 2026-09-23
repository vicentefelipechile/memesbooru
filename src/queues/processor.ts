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

export type QueueEnv = Cloudflare.Env & { DB: D1Database; MEDIA_BUCKET: R2Bucket };

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

	const mediaPrefix = asset.original_object_key.replace(/\/original$/, '');
	const lowKey = `${mediaPrefix}/low.avif`;
	const medKey = `${mediaPrefix}/medium.avif`;
	const source = await env.MEDIA_BUCKET.get(asset.original_object_key);

	if (!source) throw new Error(`missing media: ${asset.original_object_key}`);

	const bytes = await source.arrayBuffer();
	const metadata = { httpMetadata: { contentType: asset.mime_type } };

	await env.MEDIA_BUCKET.put(lowKey, bytes, metadata);
	await env.MEDIA_BUCKET.put(medKey, bytes, metadata);

	await media.insertVariantsAndPublish(asset.id, postId, lowKey, medKey, bytes.byteLength);
}
