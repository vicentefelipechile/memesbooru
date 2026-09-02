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
import * as postRepo from '../repositories/post-repository';

// =========================================================================================================
// Service
// =========================================================================================================

export class InteractionService {
	constructor(private readonly db: DB) {}

	async rate(viewer: AuthUser, publicId: string, value: RatingInput['value'], queue?: Queue): Promise<void> {
		const postId = await postRepo.findPostIdByPublicId(this.db, publicId);
		if (!postId) throw new NotFoundError('post not found');
		await postRepo.upsertRating(this.db, postId, viewer.id, value);
		if (queue) await queue.send({ type: 'recalculate_post_score', postId });
	}

	async favorite(viewer: AuthUser, publicId: string): Promise<void> {
		const postId = await postRepo.findPostIdByPublicId(this.db, publicId);
		if (!postId) throw new NotFoundError('post not found');
		await postRepo.addFavorite(this.db, postId, viewer.id);
	}

	async unfavorite(viewer: AuthUser, publicId: string): Promise<void> {
		const postId = await postRepo.findPostIdByPublicId(this.db, publicId);
		if (!postId) throw new NotFoundError('post not found');
		await postRepo.removeFavorite(this.db, postId, viewer.id);
	}

	async listFavorites(viewer: AuthUser): Promise<PostListingRow[]> {
		return postRepo.listFavoritesByUser(this.db, viewer.id);
	}
}
