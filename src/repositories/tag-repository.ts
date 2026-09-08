// =========================================================================================================
// TAG REPOSITORY (v2)
// =========================================================================================================
// ONLY place with SQL for tags, tag_aliases, tag_history, post_tags.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { queryOne, batch, type DB } from '../db/client';
import type { TagRow, PostTagRow, NextIdRow } from '../db/schema';

// =========================================================================================================
// Types
// =========================================================================================================

export type InsertPostTagStatementData = {
	postId: PostTagRow['post_id'];
	tagId: PostTagRow['tag_id'];
	addedBy: PostTagRow['added_by'];
	createdAt: PostTagRow['created_at'];
};

// =========================================================================================================
// Export — read-only lookup lives in ./tag-lookup (single source, re-exported here for compat)
// =========================================================================================================

export type { ResolveAliasesResult, ListByCategoryOpts } from './tag-lookup';
export { resolveTagIds, autocomplete, findByPostId, findById, listByCategory, listGroupedByCategory, getTagUsageCounts, sortTagIdsByUsage } from './tag-lookup';

// =========================================================================================================
// Builders
// =========================================================================================================

export function buildInsertPostTagStatement(db: DB, row: InsertPostTagStatementData): D1PreparedStatement {
	return db.prepare('INSERT INTO post_tags (post_id, tag_id, added_by, created_at) VALUES (?, ?, ?, ?)').bind(row.postId, row.tagId, row.addedBy, row.createdAt);
}

// =========================================================================================================
// Commands
// =========================================================================================================

export async function incrementUsage(db: DB, tagIds: number[]): Promise<void> {
	if (!tagIds.length) return;

	const stmts = tagIds.map((id) => db.prepare('UPDATE tags SET usage_count = usage_count + 1, updated_at = ? WHERE id = ?').bind(Date.now(), id));

	await batch(db, stmts);
}

export async function ensureTags(db: DB, normalized: string[], authorId: number): Promise<number[]> {
	const ids: number[] = [];
	const now = Date.now();

	for (const n of normalized) {
		const id = await findOrCreateTagId(db, n, authorId, now);

		ids.push(id);
	}

	return ids;
}

async function findOrCreateTagId(db: DB, normalized: string, authorId: number, now: number): Promise<number> {
	const existing = await queryOne<Pick<TagRow, 'id'>>(db, 'SELECT id FROM tags WHERE normalized_name = ?', [normalized]);
	if (existing) return existing.id;

	const nextId = (await queryOne<NextIdRow>(db, 'SELECT COALESCE(MAX(id),0)+1 as v FROM tags', []))?.v ?? 1;

	await batch(db, [
		db
			.prepare(
				`INSERT INTO tags (
					id,
					normalized_name,
					category,
					usage_count,
					status,
					created_by,
					created_at,
					updated_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			)
			.bind(nextId, normalized, 'reaction', 0, 'active', authorId, now, now),
	]);

	return nextId;
}
