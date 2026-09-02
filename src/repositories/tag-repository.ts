// =========================================================================================================
// TAG REPOSITORY (v2)
// =========================================================================================================
// ONLY place with SQL for tags, tag_aliases, tag_history, post_tags.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { queryOne, queryAll, batch, type DB } from '../db/client';
import type { TagRow, TagAliasRow } from '../db/schema';
import { normalizeTag } from '../validators';

// =========================================================================================================
// Queries
// =========================================================================================================

export async function resolveTagIds(db: DB, inputs: string[]): Promise<number[]> {
	const normalized = inputs.map(normalizeTag).filter(Boolean);
	if (normalized.length === 0) return [];
	const placeholders = normalized.map(() => '?').join(',');
	const aliasRows = await queryAll<{ tag_id: number; alias_normalized: string }>(db, `SELECT tag_id, alias_normalized FROM tag_aliases WHERE alias_normalized IN (${placeholders})`, normalized);
	const aliasMap = new Map(aliasRows.map((r) => [r.alias_normalized, r.tag_id]));
	const aliasIds = aliasRows.map((r) => r.tag_id);
	const remaining = normalized.filter((n) => !aliasMap.has(n));
	if (remaining.length === 0) return aliasIds;
	const tagPlaceholders = remaining.map(() => '?').join(',');
	const tags = await queryAll<TagRow>(db, `SELECT * FROM tags WHERE normalized_name IN (${tagPlaceholders})`, remaining);
	const directIds = tags.map((t) => t.id);
	return [...aliasIds, ...directIds];
}

export async function autocomplete(db: DB, prefix: string, limit = 20): Promise<TagRow[]> {
	const norm = normalizeTag(prefix);
	const safePattern = norm.replace(/[%_\\]/g, '\\$&');
	return queryAll<TagRow>(db, "SELECT * FROM tags WHERE normalized_name LIKE ? || '%' ESCAPE '\\' ORDER BY usage_count DESC, normalized_name ASC LIMIT ?", [safePattern, limit]);
}

export async function findByPostId(db: DB, postId: number): Promise<TagRow[]> {
	return queryAll<TagRow>(db, 'SELECT t.* FROM tags t JOIN post_tags pt ON pt.tag_id = t.id WHERE pt.post_id = ? ORDER BY t.normalized_name', [postId]);
}

export async function findById(db: DB, id: number): Promise<TagRow | null> {
	return queryOne<TagRow>(db, 'SELECT * FROM tags WHERE id = ?', [id]);
}

export async function listByCategory(db: DB, category: string, opts: { limit: number; offset?: number }): Promise<TagRow[]> {
	const limit = opts.limit;
	const offset = opts.offset ?? 0;
	return queryAll<TagRow>(db, `SELECT * FROM tags WHERE category = ? ORDER BY usage_count DESC, normalized_name ASC LIMIT ? OFFSET ?`, [category, limit, offset]);
}

export async function listGroupedByCategory(db: DB, perCategoryLimit = 25): Promise<Record<string, TagRow[]>> {
	const sql = `
		WITH ranked AS (
			SELECT *, ROW_NUMBER() OVER (PARTITION BY category ORDER BY normalized_name ASC) AS rn
			FROM tags
			WHERE status = 'active'
		)
		SELECT id, normalized_name, display_name, category, usage_count, status, created_by, created_at, updated_at
		FROM ranked
		WHERE rn <= ?
		ORDER BY category, normalized_name ASC
	`;
	const rows = await queryAll<TagRow>(db, sql, [perCategoryLimit]);
	const groups: Record<string, TagRow[]> = {};
	for (const r of rows) {
		(groups[r.category] ??= []).push(r);
	}
	return groups;
}

// =========================================================================================================
// Commands
// =========================================================================================================

export async function incrementUsage(db: DB, tagIds: number[]): Promise<void> {
	if (!tagIds.length) return;
	const stmts = tagIds.map((id) => db.prepare('UPDATE tags SET usage_count = usage_count + 1, updated_at = ? WHERE id = ?').bind(Date.now(), id));
	await batch(db, stmts);
}

export async function getTagUsageCounts(db: DB, tagIds: number[]): Promise<Map<number, number>> {
	if (!tagIds.length) return new Map();
	const placeholders = tagIds.map(() => '?').join(',');
	const rows = await queryAll<{ id: number; usage_count: number }>(db, `SELECT id, usage_count FROM tags WHERE id IN (${placeholders})`, tagIds);
	return new Map(rows.map((r) => [r.id, r.usage_count]));
}

export async function sortTagIdsByUsage(db: DB, tagIds: number[]): Promise<number[]> {
	if (tagIds.length <= 1) return tagIds;
	const counts = await getTagUsageCounts(db, tagIds);
	return [...tagIds].sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0));
}

export async function ensureTags(db: DB, normalized: string[], authorId: number): Promise<number[]> {
	const ids: number[] = [];
	const now = Date.now();
	for (const n of normalized) {
		const existing = await queryOne<{ id: number }>(db, 'SELECT id FROM tags WHERE normalized_name = ?', [n]);
		if (existing) {
			ids.push(existing.id);
			continue;
		}
		const nextId = (await queryOne<{ v: number }>(db, 'SELECT COALESCE(MAX(id),0)+1 as v FROM tags', []))?.v ?? 1;
		await batch(db, [db.prepare('INSERT INTO tags (id, normalized_name, category, usage_count, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(nextId, n, 'reaction', 0, 'active', authorId, now, now)]);
		ids.push(nextId);
	}
	return ids;
}

export function buildInsertPostTagStatement(db: DB, row: { postId: number; tagId: number; addedBy: number; createdAt: number }): D1PreparedStatement {
	return db.prepare('INSERT INTO post_tags (post_id, tag_id, added_by, created_at) VALUES (?, ?, ?, ?)').bind(row.postId, row.tagId, row.addedBy, row.createdAt);
}
