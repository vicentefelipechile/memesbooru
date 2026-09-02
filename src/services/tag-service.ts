// =========================================================================================================
// TAG SERVICE
// =========================================================================================================
// Business rules for tag browsing / grouping. No Hono. Throws DomainError if needed.

import type { DB } from '../db/client';
import * as tagRepo from '../repositories/tag-repository';
import type { BrowseTagsResponse } from '../validators';

export class TagService {
	constructor(private readonly db: DB) {}

	async browse(params: { perCategoryLimit?: number } = {}): Promise<BrowseTagsResponse> {
		const limit = params.perCategoryLimit ?? 25;
		const groups = await tagRepo.listGroupedByCategory(this.db, limit);
		// Ensure all categories present even if empty (for stable frontend)
		const allCats = ['reaction', 'source', 'people', 'character', 'meta'] as const;
		const result: BrowseTagsResponse = { groups: {} as BrowseTagsResponse['groups'] };
		for (const cat of allCats) {
			result.groups[cat] = { tags: (groups[cat] ?? []).map((t) => ({ name: t.normalized_name, display: t.display_name, usage: t.usage_count })) };
		}
		return result;
	}

	async browseCategory(category: string, params: { limit?: number; offset?: number } = {}): Promise<{ tags: Array<{ name: string; display: string | null; usage: number }> }> {
		const limit = params.limit ?? 50;
		const offset = params.offset ?? 0;
		const rows = await tagRepo.listByCategory(this.db, category, { limit, offset });
		return { tags: rows.map((t) => ({ name: t.normalized_name, display: t.display_name, usage: t.usage_count })) };
	}
}
