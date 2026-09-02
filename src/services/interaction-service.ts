// =========================================================================================================
// INTERACTION SERVICE (v2)
// =========================================================================================================
// Votes + favorites. Atomic via batch. Score recalc via queue (not inline).
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import type { DB } from '../db/client';
import { batch } from '../db/client';
import { NotFoundError } from '../domain/errors';
import type { AuthUser } from '../types';

// =========================================================================================================
// Service
// =========================================================================================================

export class InteractionService {
	constructor(private readonly db: DB) {}

	async rate(viewer: AuthUser, publicId: string, value: number, queue?: Queue): Promise<void> {
		const post = await this.db.prepare('SELECT id FROM posts WHERE public_id = ?').bind(publicId).first<{ id: number }>();
		if (!post) throw new NotFoundError('post not found');
		const now = Date.now();
		await this.db
			.prepare('INSERT INTO post_ratings (post_id, user_id, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(post_id, user_id) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at')
			.bind(post.id, viewer.id, value, now, now)
			.run();
		await this.db
			.prepare('INSERT INTO jobs (job_type, entity_id, status, available_at, created_at) VALUES (?, ?, ?, ?, ?)')
			.bind('recalculate_post_score', post.id, 'pending', now + 60_000, now)
			.run();
		if (queue) await queue.send({ type: 'recalculate_post_score', postId: post.id });
	}

	async favorite(viewer: AuthUser, publicId: string): Promise<void> {
		const post = await this.db.prepare('SELECT id FROM posts WHERE public_id = ?').bind(publicId).first<{ id: number }>();
		if (!post) throw new NotFoundError('post not found');
		const now = Date.now();
		await batch(this.db, [
			this.db.prepare('INSERT OR IGNORE INTO post_favorites (post_id, user_id, created_at) VALUES (?, ?, ?)').bind(post.id, viewer.id, now),
			this.db.prepare('UPDATE posts SET favorite_count = (SELECT COUNT(*) FROM post_favorites WHERE post_id = ?), updated_at = ? WHERE id = ?').bind(post.id, now, post.id),
			this.db.prepare('UPDATE post_listing SET favorite_count = (SELECT COUNT(*) FROM post_favorites WHERE post_id = ?) WHERE post_id = ?').bind(post.id, post.id),
		]);
	}

	async unfavorite(viewer: AuthUser, publicId: string): Promise<void> {
		const post = await this.db.prepare('SELECT id FROM posts WHERE public_id = ?').bind(publicId).first<{ id: number }>();
		if (!post) throw new NotFoundError('post not found');
		const now = Date.now();
		await batch(this.db, [
			this.db.prepare('DELETE FROM post_favorites WHERE post_id = ? AND user_id = ?').bind(post.id, viewer.id),
			this.db.prepare('UPDATE posts SET favorite_count = (SELECT COUNT(*) FROM post_favorites WHERE post_id = ?), updated_at = ? WHERE id = ?').bind(post.id, now, post.id),
			this.db.prepare('UPDATE post_listing SET favorite_count = (SELECT COUNT(*) FROM post_favorites WHERE post_id = ?) WHERE post_id = ?').bind(post.id, post.id),
		]);
	}

	async listFavorites(viewer: AuthUser): Promise<unknown[]> {
		const { results } = await this.db.prepare('SELECT pl.* FROM post_listing pl JOIN post_favorites pf ON pf.post_id = pl.post_id WHERE pf.user_id = ? ORDER BY pf.created_at DESC LIMIT 50').bind(viewer.id).all();
		return results ?? [];
	}
}
