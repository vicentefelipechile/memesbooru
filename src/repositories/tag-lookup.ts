// =========================================================================================================
// TAG LOOKUP (v2)
// =========================================================================================================
// Read-only tag resolution + browsing queries. Commands stay in tag-repository.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import { queryOne, queryAll, type DB } from '../db/client';
import type { TagRow, TagAliasRow } from '../db/schema';
import { normalizeTag } from '../validators';
import type { PostId } from '../types';

// =========================================================================================================
// Types
// =========================================================================================================

export type ResolveAliasesResult = {
	ids: number[];
	known: Set<string>;
};

export type ListByCategoryOpts = {
	limit: number;
	offset?: number;
};

// =========================================================================================================
// Queries
// =========================================================================================================

export async function resolveTagIds(db: DB, inputs: string[]): Promise<number[]> {
	return (await resolveTags(db, inputs)).ids;
}

export async function resolveTags(db: DB, inputs: string[]): Promise<ResolveAliasesResult> {
	const normalized = [...new Set(inputs.map(normalizeTag).filter(Boolean))];
	if (normalized.length === 0) return { ids: [], known: new Set() };

	const aliasIds = await resolveViaAliases(db, normalized);
	const remaining = normalized.filter((n) => !aliasIds.known.has(n));
	if (remaining.length === 0) return { ids: [...new Set(aliasIds.ids)], known: aliasIds.known };

	const tags = await resolveViaTags(db, remaining);

	return { ids: [...new Set([...aliasIds.ids, ...tags.map((tag) => tag.id)])], known: new Set([...aliasIds.known, ...tags.map((tag) => tag.normalized_name)]) };
}

async function resolveViaAliases(db: DB, normalized: string[]): Promise<ResolveAliasesResult> {
	const placeholders = normalized.map(() => '?').join(',');

	const aliasRows = await queryAll<Pick<TagAliasRow, 'tag_id' | 'alias_normalized'>>(
		db,
		`SELECT
			tag_id,
			alias_normalized
		FROM
			tag_aliases
		WHERE
			alias_normalized
		IN
			(${placeholders})
		`,
		normalized,
	);

	const known = new Set(aliasRows.map((r) => r.alias_normalized));
	return {
		ids: aliasRows.map((r) => r.tag_id),
		known,
	};
}

async function resolveViaTags(db: DB, remaining: string[]): Promise<Pick<TagRow, 'id' | 'normalized_name'>[]> {
	const tagPlaceholders = remaining.map(() => '?').join(',');

	return queryAll<Pick<TagRow, 'id' | 'normalized_name'>>(db, `SELECT id, normalized_name FROM tags WHERE status = 'active' AND normalized_name IN (${tagPlaceholders})`, remaining);
}

export async function findByPostIds(db: DB, postIds: PostId[]): Promise<Pick<TagRow, 'normalized_name' | 'category' | 'usage_count'>[]> {
	if (!postIds.length) return [];

	const placeholders = postIds.map(() => '?').join(',');

	return queryAll<Pick<TagRow, 'normalized_name' | 'category' | 'usage_count'>>(
		db,
		`SELECT DISTINCT t.normalized_name, t.category, t.usage_count FROM post_tags pt JOIN tags t ON t.id = pt.tag_id
		 WHERE pt.post_id IN (${placeholders}) AND t.status = 'active' ORDER BY t.category, t.normalized_name`,
		postIds,
	);
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

export async function listByCategory(db: DB, category: string, opts: ListByCategoryOpts): Promise<TagRow[]> {
	const limit = opts.limit;
	const offset = opts.offset ?? 0;

	return queryAll<TagRow>(
		db,
		`SELECT
			*
		FROM
			tags
		WHERE
			category = ?
		ORDER BY
			usage_count DESC,
			normalized_name ASC
		LIMIT
			?
		OFFSET ?`,
		[category, limit, offset],
	);
}

export async function listGroupedByCategory(db: DB, perCategoryLimit = 25): Promise<Record<string, TagRow[]>> {
	const sql = `
		WITH ranked AS (
			SELECT *, ROW_NUMBER() OVER (PARTITION BY category ORDER BY normalized_name ASC) AS rn
			FROM tags
			WHERE status = 'active'
		)
		SELECT
			id,
			normalized_name, 
			display_name,
			category,
			usage_count,
			status,
			created_by,
			created_at,
			updated_at
		FROM
			ranked
		WHERE
			rn <= ?
		ORDER BY
			category,
			normalized_name ASC
	`;

	const rows = await queryAll<TagRow>(db, sql, [perCategoryLimit]);
	const groups: Record<string, TagRow[]> = {};

	for (const r of rows) {
		(groups[r.category] ??= []).push(r);
	}

	return groups;
}

export async function getTagUsageCounts(db: DB, tagIds: number[]): Promise<Map<number, number>> {
	if (!tagIds.length) return new Map();

	const placeholders = tagIds.map(() => '?').join(',');
	const rows = await queryAll<Pick<TagRow, 'id' | 'usage_count'>>(
		db,
		`SELECT
			id,
			usage_count
		FROM
			tags
		WHERE
			id IN (${placeholders})`,
		tagIds,
	);

	return new Map(rows.map((r) => [r.id, r.usage_count]));
}

export async function sortTagIdsByUsage(db: DB, tagIds: number[]): Promise<number[]> {
	if (tagIds.length <= 1) return tagIds;

	const counts = await getTagUsageCounts(db, tagIds);

	return [...tagIds].sort((a, b) => (counts.get(a) ?? 0) - (counts.get(b) ?? 0));
}
