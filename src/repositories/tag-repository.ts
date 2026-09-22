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
import type { PostId } from '../types';
import { resolveTagIds, resolveTags, findByPostIds, findByPostId, listByCategory, listGroupedByCategory, autocomplete, sortTagIdsByUsage, type ResolveAliasesResult, type ListByCategoryOpts } from './tag-lookup';

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
export { resolveTagIds, resolveTags, autocomplete, findByPostId, findByPostIds, findById, listByCategory, listGroupedByCategory, getTagUsageCounts, sortTagIdsByUsage } from './tag-lookup';

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

export class TagRepository {
	constructor(private readonly db: DB) {}

	async ensureTags(normalized: string[], authorId: number): Promise<number[]> {
		return ensureTags(this.db, normalized, authorId);
	}

	async resolveTagIds(inputs: string[]): Promise<number[]> {
		return resolveTagIds(this.db, inputs);
	}

	async resolveTags(inputs: string[]): Promise<ResolveAliasesResult> {
		return resolveTags(this.db, inputs);
	}

	async sortTagIdsByUsage(tagIds: number[]): Promise<number[]> {
		return sortTagIdsByUsage(this.db, tagIds);
	}

	async findByPostIds(postIds: PostId[]): Promise<Pick<TagRow, 'normalized_name' | 'category' | 'usage_count'>[]> {
		return findByPostIds(this.db, postIds);
	}

	async findByPostId(postId: number): Promise<TagRow[]> {
		return findByPostId(this.db, postId);
	}

	async listByCategory(category: string, opts: ListByCategoryOpts): Promise<TagRow[]> {
		return listByCategory(this.db, category, opts);
	}

	async listGroupedByCategory(perCategoryLimit = 25): Promise<Record<string, TagRow[]>> {
		return listGroupedByCategory(this.db, perCategoryLimit);
	}

	async autocomplete(prefix: string, limit = 20): Promise<TagRow[]> {
		return autocomplete(this.db, prefix, limit);
	}
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
