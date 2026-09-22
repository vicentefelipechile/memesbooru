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

export type QueueEnv = Cloudflare.Env & { DB: D1Database; MEDIA_BUCKET: R2Bucket; QUARANTINE_BUCKET: R2Bucket };

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

function toBytes(checksum: ArrayBuffer | Uint8Array): Uint8Array {
	return checksum instanceof Uint8Array ? checksum : new Uint8Array(checksum);
}

async function processMedia(env: QueueEnv, postId: number): Promise<void> {
	const db = env.DB;
	const media = new MediaRepository(db);
	const asset = await media.findAssetByPostId(postId);

	if (!asset) return;

	const existing = await media.findVariant(asset.id, 'low');

	if (existing) {
		await media.publishPostWithExistingVariant(postId, asset.id);

		return;
	}

	const lowKey = buildLowKey(asset.checksum, postId);
	const medKey = `media/${postId}/medium.avif`;
	const dummy = new Uint8Array(10 * 1024);

	await env.MEDIA_BUCKET.put(lowKey, dummy, { httpMetadata: { contentType: 'image/avif' } });
	await env.MEDIA_BUCKET.put(medKey, dummy, { httpMetadata: { contentType: 'image/avif' } });

	await media.insertVariantsAndPublish(asset.id, postId, lowKey, medKey, dummy.length);
}

function buildLowKey(checksum: ArrayBuffer | Uint8Array | null, postId: number): string {
	if (!checksum) return `media/${postId}/low.avif`;

	const hex = Array.from(toBytes(checksum).slice(0, 4))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');

	return `media/${hex}/low.avif`;
}
