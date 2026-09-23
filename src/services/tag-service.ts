// =========================================================================================================
// TAG SERVICE (v2)
// =========================================================================================================
// Business rules for tag browsing / grouping. No Hono. Throws DomainError if needed.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import type { DB } from '../db/client';
import { TagRepository } from '../repositories/tag-repository';
import type { BrowseTagsResponse } from '../validators';
import type { AuthUser, BrowseCategoryParams, BrowseParams, TagItemsResult } from '../types';
import { ForbiddenError } from '../domain/errors';

// =========================================================================================================
// Service
// =========================================================================================================

export class TagService {
	private readonly tags: TagRepository;

	constructor(private readonly db: DB) {
		this.tags = new TagRepository(db);
	}

	async browse(params: BrowseParams = {}): Promise<BrowseTagsResponse> {
		const limit = params.perCategoryLimit ?? 25;
		const groups = await this.tags.listGroupedByCategory(limit);

		// Ensure all categories present even if empty (for stable frontend)
		const allCats = ['reaction', 'source', 'people', 'character', 'meta'] as const;
		const result: BrowseTagsResponse = { groups: {} as BrowseTagsResponse['groups'] };

		for (const cat of allCats) {
			result.groups[cat] = { tags: (groups[cat] ?? []).map((t) => ({ name: t.normalized_name, display: t.display_name, usage: t.usage_count })) };
		}

		return result;
	}

	async browseCategory(category: string, params: BrowseCategoryParams = {}): Promise<TagItemsResult> {
		const limit = params.limit ?? 50;
		const offset = params.offset ?? 0;

		const rows = await this.tags.listByCategory(category, { limit, offset });

		return { tags: rows.map((t) => ({ name: t.normalized_name, display: t.display_name, usage: t.usage_count })) };
	}

	list(limit = 100, offset = 0) {
		return this.tags.list(limit, offset);
	}

	update(id: number, displayName: string | null, description: string | null, category: string, user: AuthUser): Promise<void> {
		this.assertEditor(user);
		return this.tags.update(id, displayName, description, category, user.id);
	}

	addAlias(alias: string, tagId: number, user: AuthUser): Promise<void> {
		this.assertEditor(user);
		return this.tags.addAlias(alias, tagId, user.id);
	}

	listAliases(limit = 100, offset = 0) {
		return this.tags.listAliases(limit, offset);
	}

	listHistory(tagId: number) {
		return this.tags.listHistory(tagId);
	}

	revert(tagId: number, historyId: number, user: AuthUser): Promise<void> {
		this.assertEditor(user);
		return this.tags.revert(tagId, historyId, user.id);
	}

	private assertEditor(user: AuthUser): void {
		if (!user.isAdmin && user.rank !== 'trusted') throw new ForbiddenError('se requiere rango trusted');
	}
}
