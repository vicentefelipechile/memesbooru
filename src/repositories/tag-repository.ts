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
import { normalizeTag } from '../validators';

// =========================================================================================================
// Types
// =========================================================================================================

export type InsertPostTagStatementData = {
	postId: PostTagRow['post_id'];
	tagId: PostTagRow['tag_id'];
	addedBy: PostTagRow['added_by'];
	createdAt: PostTagRow['created_at'];
};

export type ResolveAliasesResult = { ids: number[]; known: Set<string> };
export type ListByCategoryOpts = { limit: number; offset?: number };

// =========================================================================================================
// Repository
// =========================================================================================================

export class TagRepository {
	constructor(private readonly db: DB) {}

	async ensureTags(normalized: string[], authorId: number): Promise<number[]> {
		const ids: number[] = [];
		const now = Date.now();
		for (const name of new Set(normalized)) {
			const id = (await this.resolveTagIds([name]))[0] ?? (await this.findOrCreateTagId(name, authorId, now));
			ids.push(id);
		}
		return [...new Set(ids)];
	}

	async resolveTagIds(inputs: string[]): Promise<number[]> {
		return (await this.resolveTags(inputs)).ids;
	}

	async resolveTags(inputs: string[]): Promise<ResolveAliasesResult> {
		const normalized = [...new Set(inputs.map(normalizeTag).filter(Boolean))];
		if (!normalized.length) return { ids: [], known: new Set() };
		const aliases = await this.resolveViaAliases(normalized);
		const remaining = normalized.filter((name) => !aliases.known.has(name));
		if (!remaining.length) return { ids: [...new Set(aliases.ids)], known: aliases.known };
		const tags = await this.resolveViaTags(remaining);
		return { ids: [...new Set([...aliases.ids, ...tags.map((tag) => tag.id)])], known: new Set([...aliases.known, ...tags.map((tag) => tag.normalized_name)]) };
	}

	async sortTagIdsByUsage(tagIds: number[]): Promise<number[]> {
		if (tagIds.length <= 1) return tagIds;
		const counts = await this.getTagUsageCounts(tagIds);
		return [...tagIds].sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0));
	}

	async findByPostIds(postIds: PostId[]): Promise<Pick<TagRow, 'normalized_name' | 'category' | 'usage_count'>[]> {
		if (!postIds.length) return [];
		const placeholders = postIds.map(() => '?').join(',');
		return queryAll<Pick<TagRow, 'normalized_name' | 'category' | 'usage_count'>>(
			this.db,
			`SELECT DISTINCT t.normalized_name, t.category, t.usage_count FROM post_tags pt JOIN tags t ON t.id = pt.tag_id WHERE pt.post_id IN (${placeholders}) AND t.status = 'active' ORDER BY t.category, t.normalized_name`,
			postIds,
		);
	}

	async findByPostId(postId: number): Promise<TagRow[]> {
		return queryAll<TagRow>(
			this.db,
			"SELECT t.id, t.normalized_name, t.display_name, t.description, t.category, t.usage_count, t.status, t.created_by, t.created_at, t.updated_at FROM tags t JOIN post_tags pt ON pt.tag_id = t.id WHERE pt.post_id = ? AND t.status = 'active' ORDER BY t.normalized_name",
			[postId],
		);
	}

	async listByCategory(category: string, opts: ListByCategoryOpts): Promise<TagRow[]> {
		return queryAll<TagRow>(
			this.db,
			`SELECT id, normalized_name, display_name, description, category, usage_count, status, created_by, created_at, updated_at FROM tags WHERE category = ? AND status = 'active' ORDER BY usage_count DESC, normalized_name ASC LIMIT ? OFFSET ?`,
			[category, opts.limit, opts.offset ?? 0],
		);
	}

	async listGroupedByCategory(perCategoryLimit = 25): Promise<Record<string, TagRow[]>> {
		const rows = await queryAll<TagRow>(
			this.db,
			`WITH ranked AS (SELECT id, normalized_name, display_name, category, usage_count, status, created_by, created_at, updated_at, ROW_NUMBER() OVER (PARTITION BY category ORDER BY normalized_name ASC) AS rn FROM tags WHERE status = 'active') SELECT id, normalized_name, display_name, category, usage_count, status, created_by, created_at, updated_at FROM ranked WHERE rn <= ? ORDER BY category, normalized_name ASC`,
			[perCategoryLimit],
		);
		const groups: Record<string, TagRow[]> = {};
		for (const row of rows) (groups[row.category] ??= []).push(row);
		return groups;
	}

	async autocomplete(prefix: string, limit = 20): Promise<TagRow[]> {
		const normalized = normalizeTag(prefix);
		if (!normalized || normalized.length > 40) return [];
		const pattern = `${normalized.replace(/[%_\\]/g, '\\$&')}%`;
		const columns = 't.id, t.normalized_name, t.display_name, t.description, t.category, t.usage_count, t.status, t.created_by, t.created_at, t.updated_at';
		const tags = await queryAll<TagRow>(this.db, `SELECT ${columns} FROM tags t WHERE t.status = 'active' AND t.normalized_name LIKE ? ESCAPE '\\' ORDER BY t.usage_count DESC, t.normalized_name ASC LIMIT ?`, [pattern, limit]);
		const aliases = await queryAll<TagRow>(
			this.db,
			`SELECT ${columns} FROM tag_aliases a JOIN tags t ON t.id = a.tag_id WHERE t.status = 'active' AND a.alias_normalized LIKE ? ESCAPE '\\' ORDER BY t.usage_count DESC, t.normalized_name ASC LIMIT ?`,
			[pattern, limit],
		);
		return [...new Map([...tags, ...aliases].map((tag) => [tag.id, tag])).values()].sort((a, b) => b.usage_count - a.usage_count || a.normalized_name.localeCompare(b.normalized_name)).slice(0, limit);
	}

	async getTagUsageCounts(tagIds: number[]): Promise<Map<number, number>> {
		if (!tagIds.length) return new Map();
		const placeholders = tagIds.map(() => '?').join(',');
		const rows = await queryAll<Pick<TagRow, 'id' | 'usage_count'>>(this.db, `SELECT id, usage_count FROM tags WHERE id IN (${placeholders})`, tagIds);
		return new Map(rows.map((row) => [row.id, row.usage_count]));
	}

	buildInsertPostTagStatement(row: InsertPostTagStatementData): D1PreparedStatement {
		return this.db.prepare('INSERT INTO post_tags (post_id, tag_id, added_by, created_at) VALUES (?, ?, ?, ?)').bind(row.postId, row.tagId, row.addedBy, row.createdAt);
	}

	private async resolveViaAliases(normalized: string[]): Promise<ResolveAliasesResult> {
		const placeholders = normalized.map(() => '?').join(',');
		const aliases = await queryAll<Pick<TagAliasRow, 'tag_id' | 'alias_normalized'>>(
			this.db,
			`SELECT tag_id, alias_normalized FROM tag_aliases a JOIN tags t ON t.id = a.tag_id WHERE t.status = 'active' AND alias_normalized IN (${placeholders})`,
			normalized,
		);
		return { ids: aliases.map((alias) => alias.tag_id), known: new Set(aliases.map((alias) => alias.alias_normalized)) };
	}

	private resolveViaTags(names: string[]): Promise<Pick<TagRow, 'id' | 'normalized_name'>[]> {
		const placeholders = names.map(() => '?').join(',');
		return queryAll<Pick<TagRow, 'id' | 'normalized_name'>>(this.db, `SELECT id, normalized_name FROM tags WHERE status = 'active' AND normalized_name IN (${placeholders})`, names);
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

	findUnavailableName(names: string[]): Promise<Pick<TagRow, 'normalized_name'> | null> {
		if (!names.length) return Promise.resolve(null);
		const placeholders = names.map(() => '?').join(',');
		return queryOne(
			this.db,
			`SELECT normalized_name FROM tags WHERE normalized_name IN (${placeholders}) AND status != 'active' UNION SELECT alias_normalized AS normalized_name FROM tag_aliases a JOIN tags t ON t.id = a.tag_id WHERE alias_normalized IN (${placeholders}) AND t.status != 'active' LIMIT 1`,
			[...names, ...names],
		);
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

	private async findOrCreateTagId(normalized: string, authorId: number, now: number): Promise<number> {
		await execute(this.db, 'INSERT OR IGNORE INTO tags (normalized_name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?)', [normalized, authorId, now, now]);
		const tag = await queryOne<Pick<TagRow, 'id' | 'status'>>(this.db, 'SELECT id, status FROM tags WHERE normalized_name = ?', [normalized]);
		if (!tag || tag.status !== 'active') throw new Error('Tag not active');

		return tag.id;
	}
}
