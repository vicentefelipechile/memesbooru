// =========================================================================================================
// COMMENT REPOSITORY (v2)
// =========================================================================================================
// ONLY place with SQL for comments.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { queryOne, queryAll, batch, type DB } from '../db/client';
import type { CommentRow, NextIdRow } from '../db/schema';
import { decodeCursor, type CommentCursor } from '../helpers/cursor';
import { NotFoundError, ForbiddenError } from '../domain/errors';
import type { CommentResult } from '../types';

// =========================================================================================================
// Types
// =========================================================================================================

export type CreateCommentData = {
	postId: CommentRow['post_id'];
	authorId: CommentRow['author_id'];
	body: CommentRow['body'];
	parentId: CommentRow['parent_id'];
};

export type InsertCommentRow = Pick<CommentRow, 'id' | 'post_id' | 'author_id' | 'parent_id' | 'body' | 'status' | 'created_at' | 'updated_at'>;

export type InsertCommentStatementData = {
	id: CommentRow['id'];
	postId: CommentRow['post_id'];
	authorId: CommentRow['author_id'];
	parentId: CommentRow['parent_id'];
	body: CommentRow['body'];
	status: CommentRow['status'];
	createdAt: CommentRow['created_at'];
	updatedAt: CommentRow['updated_at'];
};

// =========================================================================================================
// Queries
// =========================================================================================================

export async function listByPost(db: DB, postId: number, cursor?: string, limit = 20): Promise<CommentResult[]> {
	const cursorVal = cursor ? decodeCursor<CommentCursor>(cursor) : null;
	const base = "SELECT c.*, u.username AS author_username FROM comments c LEFT JOIN users u ON u.id = c.author_id WHERE c.post_id = ? AND c.status = 'visible'";

	if (cursorVal) {
		return queryAll<CommentResult>(db, `${base} AND (c.created_at > ? OR (c.created_at = ? AND c.id > ?)) ORDER BY c.created_at ASC, c.id ASC LIMIT ?`, [postId, cursorVal.created_at, cursorVal.created_at, cursorVal.id, limit]);
	}

	return queryAll<CommentResult>(db, `${base} ORDER BY c.created_at ASC, c.id ASC LIMIT ?`, [postId, limit]);
}

export async function findById(db: DB, id: number): Promise<CommentRow | null> {
	return queryOne<CommentRow>(db, 'SELECT * FROM comments WHERE id = ?', [id]);
}

// =========================================================================================================
// Builders
// =========================================================================================================

export function buildInsertCommentStatement(db: DB, row: InsertCommentStatementData): D1PreparedStatement {
	return db
		.prepare('INSERT INTO comments (id, post_id, author_id, parent_id, body, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
		.bind(row.id, row.postId, row.authorId, row.parentId, row.body, row.status, row.createdAt, row.updatedAt);
}

// =========================================================================================================
// Commands
// =========================================================================================================

export async function create(db: DB, data: CreateCommentData): Promise<CommentRow['id']> {
	const now = Date.now();

	if (data.parentId) {
		await assertReplyDepth(db, data.parentId);
	}

	const nextId = (await queryOne<NextIdRow>(db, 'SELECT COALESCE(MAX(id),0)+1 as v FROM comments', []))?.v ?? 1;

	await batch(db, [
		buildInsertCommentStatement(db, {
			id: nextId,
			postId: data.postId,
			authorId: data.authorId,
			parentId: data.parentId ?? null,
			body: data.body,
			status: 'visible',
			createdAt: now,
			updatedAt: now,
		}),
		db.prepare('UPDATE posts SET comment_count = comment_count + 1, updated_at = ? WHERE id = ?').bind(now, data.postId),
		db.prepare('UPDATE post_listing SET comment_count = comment_count + 1 WHERE post_id = ?').bind(data.postId),
		db.prepare('UPDATE user_activity SET comments_count = comments_count + 1, last_comment_at = ?, updated_at = ? WHERE user_id = ?').bind(now, now, data.authorId),
	]);

	return nextId;
}

async function assertReplyDepth(db: DB, parentId: number): Promise<void> {
	const parent = await queryOne<Pick<CommentRow, 'id' | 'parent_id'>>(db, 'SELECT id, parent_id FROM comments WHERE id = ?', [parentId]);

	if (!parent) throw new NotFoundError('parent not found');

	let depth = 1;
	let cur: number | null = parentId;

	while (cur) {
		const row: Pick<CommentRow, 'parent_id'> | null = await queryOne<Pick<CommentRow, 'parent_id'>>(db, 'SELECT parent_id FROM comments WHERE id = ?', [cur]);

		if (!row?.parent_id) break;

		depth++;
		cur = row.parent_id;

		if (depth > 2) throw new ForbiddenError('max depth exceeded');
	}
}

export async function softDelete(db: DB, commentId: number, requesterId: number, isModerator: boolean): Promise<void> {
	const c = await queryOne<Pick<CommentRow, 'author_id'>>(db, 'SELECT author_id FROM comments WHERE id = ?', [commentId]);

	if (!c) throw new NotFoundError('comment not found');

	if (c.author_id !== requesterId && !isModerator) throw new ForbiddenError('forbidden');

	await batch(db, [db.prepare("UPDATE comments SET status = 'hidden', deleted_at = ?, updated_at = ? WHERE id = ?").bind(Date.now(), Date.now(), commentId)]);
}
