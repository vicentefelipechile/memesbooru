// =========================================================================================================
// INTERACTION SERVICE (v2)
// =========================================================================================================
// Votes + favorites. Atomic via batch. Score recalc via queue (not inline).
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import type { DB } from '../db/client';
import { NotFoundError } from '../domain/errors';
import type { AuthUser } from '../types';
import type { RatingInput } from '../validators';
import type { PostListingRow } from '../db/schema';
import { PostRepository } from '../repositories/post-repository';

// =========================================================================================================
// Service
// =========================================================================================================

export class InteractionService {
	private readonly posts: PostRepository;

	constructor(private readonly db: DB) {
		this.posts = new PostRepository(db);
	}

	async rate(viewer: AuthUser, publicId: string, value: RatingInput['value'], queue?: Queue): Promise<void> {
		const postId = await this.posts.findPostIdByPublicId(publicId);

		if (!postId) throw new NotFoundError('post not found');

		await this.posts.upsertRating(postId, viewer.id, value);

		if (queue) await queue.send({ type: 'recalculate_post_score', postId });
	}

	async favorite(viewer: AuthUser, publicId: string): Promise<void> {
		const postId = await this.posts.findPostIdByPublicId(publicId);

		if (!postId) throw new NotFoundError('post not found');

		await this.posts.addFavorite(postId, viewer.id);
	}

	async unfavorite(viewer: AuthUser, publicId: string): Promise<void> {
		const postId = await this.posts.findPostIdByPublicId(publicId);

		if (!postId) throw new NotFoundError('post not found');

		await this.posts.removeFavorite(postId, viewer.id);
	}

	async listFavorites(viewer: AuthUser): Promise<PostListingRow[]> {
		return this.posts.listFavoritesByUser(viewer.id);
	}
}
