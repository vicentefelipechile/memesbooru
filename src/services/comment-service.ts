// =========================================================================================================
// COMMENT SERVICE (v2)
// =========================================================================================================
// Business rules for comments + soft delete. No Hono.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import type { DB } from '../db/client';
import * as commentRepo from '../repositories/comment-repository';
import * as postRepo from '../repositories/post-repository';
import { NotFoundError } from '../domain/errors';
import type { AuthUser } from '../types';

// =========================================================================================================
// Service
// =========================================================================================================

export class CommentService {
	constructor(private readonly db: DB) {}

	async listByPost(publicId: string, cursor?: string, limit = 20) {
		const postId = await postRepo.findPostIdByPublicId(this.db, publicId);
		if (!postId) throw new NotFoundError('post not found');
		return commentRepo.listByPost(this.db, postId, cursor, limit);
	}

	async create(viewer: AuthUser, publicId: string, input: { body: string; parent_id?: number | null }): Promise<{ id: number }> {
		const postId = await postRepo.findPostIdByPublicId(this.db, publicId);
		if (!postId) throw new NotFoundError('post not found');
		const id = await commentRepo.create(this.db, { postId, authorId: viewer.id, body: input.body, parentId: input.parent_id ?? null });
		return { id };
	}

	async remove(viewer: AuthUser, commentId: number): Promise<void> {
		const isModerator = viewer.isAdmin;
		await commentRepo.softDelete(this.db, commentId, viewer.id, isModerator);
	}
}
