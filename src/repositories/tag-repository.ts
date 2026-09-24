// =========================================================================================================
// TAG REPOSITORY (v2)
// =========================================================================================================
// ONLY place with SQL for tags, tag_aliases, tag_history, post_tags.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { queryOne, queryAll, batch, execute, type DB } from '../db/client';
import type { TagAliasRow, TagRow, PostTagRow, NextIdRow } from '../db/schema';
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

	list(limit = 100, offset = 0): Promise<TagRow[]> {
		return queryAll<TagRow>(this.db, 'SELECT id, normalized_name, display_name, description, category, usage_count, status, created_by, created_at, updated_at FROM tags ORDER BY updated_at DESC, id DESC LIMIT ? OFFSET ?', [limit, offset]);
	}

	findById(id: number): Promise<Pick<TagRow, 'id' | 'normalized_name' | 'display_name' | 'category'> | null> {
		return queryOne(this.db, 'SELECT id, normalized_name, display_name, category FROM tags WHERE id = ? AND status = ?', [id, 'active']);
	}

	async update(id: number, displayName: string, description: string | null | undefined, category: string, userId: number): Promise<void> {
		const old = await queryOne<Pick<TagRow, 'display_name' | 'description' | 'category'>>(this.db, 'SELECT display_name, description, category FROM tags WHERE id = ?', [id]);
		if (!old) throw new Error('tag not found');
		const now = Date.now();
		await batch(this.db, [
			this.db.prepare('UPDATE tags SET display_name = ?, description = ?, category = ?, updated_at = ? WHERE id = ?').bind(displayName, description === undefined ? old.description : description, category, now, id),
			this.db
				.prepare('INSERT INTO tag_history (id, tag_id, action, previous_value, new_value, created_by, created_at) VALUES (COALESCE((SELECT MAX(id) + 1 FROM tag_history), 1), ?, ?, ?, ?, ?, ?)')
				.bind(id, 'update', JSON.stringify(old), JSON.stringify({ display_name: displayName, description: description === undefined ? old.description : description, category }), userId, now),
		]);
	}

	async addAlias(alias: string, tagId: number, userId: number): Promise<void> {
		const id = (await queryOne<NextIdRow>(this.db, 'SELECT COALESCE(MAX(id), 0) + 1 AS v FROM tag_aliases', []))?.v ?? 1;
		await execute(this.db, 'INSERT INTO tag_aliases (id, alias_normalized, tag_id, created_by, created_at) VALUES (?, ?, ?, ?, ?)', [id, alias, tagId, userId, Date.now()]);
	}

	listAliases(limit = 100, offset = 0): Promise<(TagAliasRow & Pick<TagRow, 'normalized_name'>)[]> {
		return queryAll<TagAliasRow & Pick<TagRow, 'normalized_name'>>(
			this.db,
			'SELECT a.id, a.alias_normalized, a.tag_id, a.created_by, a.created_at, t.normalized_name FROM tag_aliases a JOIN tags t ON t.id = a.tag_id ORDER BY a.created_at DESC, a.id DESC LIMIT ? OFFSET ?',
			[limit, offset],
		);
	}

	listHistory(tagId: number): Promise<{ id: number; tag_id: number; action: string; previous_value: string | null; new_value: string | null; created_by: number; created_at: number }[]> {
		return queryAll(this.db, 'SELECT id, tag_id, action, previous_value, new_value, created_by, created_at FROM tag_history WHERE tag_id = ? ORDER BY id DESC', [tagId]);
	}

	async revert(tagId: number, historyId: number, userId: number): Promise<void> {
		const history = await queryOne<{ previous_value: string | null }>(this.db, 'SELECT previous_value FROM tag_history WHERE id = ? AND tag_id = ?', [historyId, tagId]);
		if (!history?.previous_value) throw new Error('history not found');
		const now = Date.now();
		await batch(this.db, [
			this.db.prepare("UPDATE tags SET display_name = json_extract(?, '$.display_name'), category = json_extract(?, '$.category'), updated_at = ? WHERE id = ?").bind(history.previous_value, history.previous_value, now, tagId),
			this.db
				.prepare('INSERT INTO tag_history (id, tag_id, action, previous_value, new_value, created_by, created_at) VALUES (COALESCE((SELECT MAX(id) + 1 FROM tag_history), 1), ?, ?, ?, ?, ?, ?)')
				.bind(tagId, 'revert', null, history.previous_value, userId, now),
		]);
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
