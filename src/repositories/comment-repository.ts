// =========================================================================================================
// COMMENT REPOSITORY (v2)
// =========================================================================================================
// ONLY place with SQL for comments.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { queryOne, queryAll, batch, type DB } from '../db/client';
import type { CommentRow } from '../db/schema';
import { decodeCursor, type CommentCursor } from '../helpers/cursor';
import { NotFoundError, ForbiddenError } from '../domain/errors';

// =========================================================================================================
// Queries
// =========================================================================================================

export async function listByPost(db: DB, postId: number, cursor?: string, limit = 20): Promise<CommentRow[]> {
	const cursorVal = cursor ? decodeCursor<CommentCursor>(cursor) : null;
	if (cursorVal) {
		return queryAll<CommentRow>(db, "SELECT * FROM comments WHERE post_id = ? AND status = 'visible' AND (created_at > ? OR (created_at = ? AND id > ?)) ORDER BY created_at ASC, id ASC LIMIT ?", [
			postId,
			cursorVal.created_at,
			cursorVal.created_at,
			cursorVal.id,
			limit,
		]);
	}
	return queryAll<CommentRow>(db, "SELECT * FROM comments WHERE post_id = ? AND status = 'visible' ORDER BY created_at ASC, id ASC LIMIT ?", [postId, limit]);
}

export async function findById(db: DB, id: number): Promise<CommentRow | null> {
	return queryOne<CommentRow>(db, 'SELECT * FROM comments WHERE id = ?', [id]);
}

// =========================================================================================================
// Builders
// =========================================================================================================

export function buildInsertCommentStatement(db: DB, row: { id: number; postId: number; authorId: number; parentId: number | null; body: string; status: string; createdAt: number; updatedAt: number }): D1PreparedStatement {
	return db
		.prepare('INSERT INTO comments (id, post_id, author_id, parent_id, body, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
		.bind(row.id, row.postId, row.authorId, row.parentId, row.body, row.status, row.createdAt, row.updatedAt);
}

// =========================================================================================================
// Commands
// =========================================================================================================

export async function create(db: DB, data: { postId: number; authorId: number; body: string; parentId?: number | null }): Promise<number> {
	const now = Date.now();
	if (data.parentId) {
		const parent = await queryOne<{ id: number; parent_id: number | null }>(db, 'SELECT id, parent_id FROM comments WHERE id = ?', [data.parentId]);
		if (!parent) throw new NotFoundError('parent not found');
		let depth = 1;
		let cur: number | null = data.parentId;
		while (cur) {
			const row: { parent_id: number | null } | null = await queryOne<{ parent_id: number | null }>(db, 'SELECT parent_id FROM comments WHERE id = ?', [cur]);
			if (!row?.parent_id) break;
			depth++;
			cur = row.parent_id;
			if (depth > 2) throw new ForbiddenError('max depth exceeded');
		}
	}
	const nextId = (await queryOne<{ v: number }>(db, 'SELECT COALESCE(MAX(id),0)+1 as v FROM comments', []))?.v ?? 1;
	await batch(db, [
		buildInsertCommentStatement(db, { id: nextId, postId: data.postId, authorId: data.authorId, parentId: data.parentId ?? null, body: data.body, status: 'visible', createdAt: now, updatedAt: now }),
		db.prepare('UPDATE posts SET comment_count = comment_count + 1, updated_at = ? WHERE id = ?').bind(now, data.postId),
		db.prepare('UPDATE post_listing SET comment_count = comment_count + 1 WHERE post_id = ?').bind(data.postId),
		db.prepare('UPDATE user_activity SET comments_count = comments_count + 1, last_comment_at = ?, updated_at = ? WHERE user_id = ?').bind(now, now, data.authorId),
	]);
	return nextId;
}

export async function softDelete(db: DB, commentId: number, requesterId: number, isModerator: boolean): Promise<void> {
	const c = await queryOne<{ author_id: number }>(db, 'SELECT author_id FROM comments WHERE id = ?', [commentId]);
	if (!c) throw new NotFoundError('comment not found');
	if (c.author_id !== requesterId && !isModerator) throw new ForbiddenError('forbidden');
	await batch(db, [db.prepare("UPDATE comments SET status = 'hidden', deleted_at = ?, updated_at = ? WHERE id = ?").bind(Date.now(), Date.now(), commentId)]);
}
