// =========================================================================================================
// TAG REPOSITORY (v2)
// =========================================================================================================
// ONLY place with SQL for tags, tag_aliases, tag_history, post_tags.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { queryOne, queryAll, batch, execute, type DB } from '../db/client';
import type { TagAliasRow, TagRow, PostTagRow } from '../db/schema';
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

export async function ensureTags(db: DB, normalized: string[], authorId: number): Promise<number[]> {
	const ids: number[] = [];
	const now = Date.now();

	for (const n of new Set(normalized)) {
		const resolved = await resolveTagIds(db, [n]);
		const id = resolved[0] ?? (await findOrCreateTagId(db, n, authorId, now));

		ids.push(id);
	}

	return [...new Set(ids)];
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

	list(limit = 100, cursor?: number, prefix = '', category?: string): Promise<TagRow[]> {
		const pattern = `${prefix.replace(/[%_\\]/g, '\\$&')}%`;
		return queryAll<TagRow>(
			this.db,
			`SELECT id, normalized_name, display_name, description, category, usage_count, status, created_by, created_at, updated_at FROM tags WHERE id < ? AND normalized_name LIKE ? ESCAPE '\\'${category ? ' AND category = ?' : ''} ORDER BY id DESC LIMIT ?`,
			[cursor ?? Number.MAX_SAFE_INTEGER, pattern, ...(category ? [category] : []), limit],
		);
	}

	findById(id: number): Promise<TagRow | null> {
		return queryOne<TagRow>(this.db, 'SELECT id, normalized_name, display_name, description, category, usage_count, status, created_by, created_at, updated_at FROM tags WHERE id = ?', [id]);
	}

	findByName(name: string): Promise<Pick<TagRow, 'id'> | null> {
		return queryOne<Pick<TagRow, 'id'>>(this.db, 'SELECT id FROM tags WHERE normalized_name = ?', [name]);
	}

	findAlias(id: number): Promise<(TagAliasRow & Pick<TagRow, 'normalized_name'>) | null> {
		return queryOne<TagAliasRow & Pick<TagRow, 'normalized_name'>>(this.db, 'SELECT a.id, a.alias_normalized, a.tag_id, a.created_by, a.created_at, t.normalized_name FROM tag_aliases a JOIN tags t ON t.id = a.tag_id WHERE a.id = ?', [id]);
	}

	findAliasByName(name: string): Promise<TagAliasRow | null> {
		return queryOne<TagAliasRow>(this.db, 'SELECT id, alias_normalized, tag_id, created_by, created_at FROM tag_aliases WHERE alias_normalized = ?', [name]);
	}

	async create(name: string, display: string | null, description: string | null, category: string, userId: number): Promise<number> {
		const now = Date.now();
		await execute(this.db, 'INSERT INTO tags (normalized_name, display_name, description, category, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [name, display, description, category, userId, now, now]);
		const row = await this.findByName(name);
		if (!row) throw new Error('Tag creation failed');

		return row.id;
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
		await execute(this.db, 'INSERT INTO tag_aliases (alias_normalized, tag_id, created_by, created_at) VALUES (?, ?, ?, ?)', [alias, tagId, userId, Date.now()]);
	}

	updateAlias(id: number, alias: string, tagId: number): Promise<D1Result> {
		return execute(this.db, 'UPDATE tag_aliases SET alias_normalized = ?, tag_id = ? WHERE id = ?', [alias, tagId, id]);
	}

	deleteAlias(id: number): Promise<D1Result> {
		return execute(this.db, 'DELETE FROM tag_aliases WHERE id = ?', [id]);
	}

	listAliases(limit = 100, cursor?: number, prefix = ''): Promise<(TagAliasRow & Pick<TagRow, 'normalized_name'>)[]> {
		const pattern = `${prefix.replace(/[%_\\]/g, '\\$&')}%`;
		return queryAll<TagAliasRow & Pick<TagRow, 'normalized_name'>>(
			this.db,
			"SELECT a.id, a.alias_normalized, a.tag_id, a.created_by, a.created_at, t.normalized_name FROM tag_aliases a JOIN tags t ON t.id = a.tag_id WHERE a.id < ? AND a.alias_normalized LIKE ? ESCAPE '\\' ORDER BY a.id DESC LIMIT ?",
			[cursor ?? Number.MAX_SAFE_INTEGER, pattern, limit],
		);
	}

	listHistory(tagId: number): Promise<{ id: number; tag_id: number; action: string; previous_value: string | null; new_value: string | null; created_by: number; created_at: number }[]> {
		return queryAll(this.db, 'SELECT id, tag_id, action, previous_value, new_value, created_by, created_at FROM tag_history WHERE tag_id = ? ORDER BY id DESC', [tagId]);
	}

	findHistory(tagId: number, historyId: number): Promise<Pick<TagRow, 'id'> | null> {
		return queryOne<Pick<TagRow, 'id'>>(this.db, 'SELECT id FROM tag_history WHERE id = ? AND tag_id = ? AND previous_value IS NOT NULL', [historyId, tagId]);
	}

	async revert(tagId: number, historyId: number, userId: number): Promise<void> {
		const history = await queryOne<{ previous_value: string | null }>(this.db, 'SELECT previous_value FROM tag_history WHERE id = ? AND tag_id = ?', [historyId, tagId]);
		if (!history?.previous_value) throw new Error('history not found');
		const current = await queryOne<Pick<TagRow, 'display_name' | 'description' | 'category'>>(this.db, 'SELECT display_name, description, category FROM tags WHERE id = ?', [tagId]);
		if (!current) throw new Error('tag not found');
		const now = Date.now();
		await batch(this.db, [
			this.db
				.prepare("UPDATE tags SET display_name = json_extract(?, '$.display_name'), description = json_extract(?, '$.description'), category = json_extract(?, '$.category'), updated_at = ? WHERE id = ?")
				.bind(history.previous_value, history.previous_value, history.previous_value, now, tagId),
			this.db
				.prepare('INSERT INTO tag_history (id, tag_id, action, previous_value, new_value, created_by, created_at) VALUES (COALESCE((SELECT MAX(id) + 1 FROM tag_history), 1), ?, ?, ?, ?, ?, ?)')
				.bind(tagId, 'revert', JSON.stringify(current), history.previous_value, userId, now),
		]);
	}
}

async function findOrCreateTagId(db: DB, normalized: string, authorId: number, now: number): Promise<number> {
	await execute(db, 'INSERT OR IGNORE INTO tags (normalized_name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?)', [normalized, authorId, now, now]);
	const tag = await queryOne<Pick<TagRow, 'id' | 'status'>>(db, 'SELECT id, status FROM tags WHERE normalized_name = ?', [normalized]);
	if (!tag || tag.status !== 'active') throw new Error('Tag not active');

	return tag.id;
}
