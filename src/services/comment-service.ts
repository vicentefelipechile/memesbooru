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
import { PermissionService } from './permission-service';
import { ForbiddenError, NotFoundError, ValidationError } from '../domain/errors';
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
		new PermissionService(this.db).require(viewer, 'comment');
		const postId = await this.posts.findPostIdByPublicId(publicId);

		if (!postId) throw new NotFoundError('post not found');

		if (input.parent_id) {
			let parentId: number | null = input.parent_id;
			let depth = 0;

			while (parentId) {
				const parent = await this.comments.findById(parentId);
				if (!parent || parent.status !== 'visible') throw new NotFoundError('parent not found');
				if (parent.post_id !== postId) throw new ValidationError('parent belongs to another post');
				if (++depth > 2) throw new ValidationError('max depth exceeded');
				parentId = parent.parent_id;
			}
		}

		const id = await this.comments.create({ postId, authorId: viewer.id, body: input.body, parentId: input.parent_id ?? null });

		return { id };
	}

	async remove(viewer: AuthUser, commentId: number): Promise<void> {
		const comment = await this.comments.findById(commentId);
		if (!comment) throw new NotFoundError('comment not found');

		const isModerator = new PermissionService(this.db).has(viewer, 'moderate');
		if (comment.author_id !== viewer.id && !isModerator) throw new ForbiddenError('forbidden');

		await this.comments.softDelete(commentId);
	}
}
