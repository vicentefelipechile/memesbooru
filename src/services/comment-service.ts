// =========================================================================================================
// COMMENT SERVICE (v2)
// =========================================================================================================
// Business rules for comments + soft delete. No Hono.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import type { DB } from '../db/client';
import { CommentRepository } from '../repositories/comment-repository';
import { PostRepository } from '../repositories/post-repository';
import { NotFoundError } from '../domain/errors';
import type { AuthUser, CreatedCommentResult } from '../types';
import type { CommentInput } from '../validators';

// =========================================================================================================
// Service
// =========================================================================================================

export class CommentService {
	private readonly comments: CommentRepository;
	private readonly posts: PostRepository;

	constructor(private readonly db: DB) {
		this.comments = new CommentRepository(db);
		this.posts = new PostRepository(db);
	}

	async listByPost(publicId: string, cursor?: string, limit = 20) {
		const postId = await this.posts.findPostIdByPublicId(publicId);

		if (!postId) throw new NotFoundError('post not found');

		return this.comments.listByPost(postId, cursor, limit);
	}

	listRecent(limit = 50) {
		return this.comments.listRecent(limit);
	}

	async create(viewer: AuthUser, publicId: string, input: CommentInput): Promise<CreatedCommentResult> {
		const postId = await this.posts.findPostIdByPublicId(publicId);

		if (!postId) throw new NotFoundError('post not found');

		const id = await this.comments.create({ postId, authorId: viewer.id, body: input.body, parentId: input.parent_id ?? null });

		return { id };
	}

	async remove(viewer: AuthUser, commentId: number): Promise<void> {
		const isModerator = viewer.isAdmin;
		await this.comments.softDelete(commentId, viewer.id, isModerator);
	}
}
