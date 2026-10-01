// =========================================================================================================
// TAG SERVICE (v2)
// =========================================================================================================
// Business rules for tag browsing / grouping. No Hono. Throws DomainError if needed.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import type { DB } from '../db/client';
import type { TagAliasRow, TagRow } from '../db/schema';
import { TagRepository } from '../repositories/tag-repository';
import { normalizeTag, TagInputSchema, type BrowseTagsResponse } from '../validators';
import type { AuthUser, BrowseCategoryParams, BrowseParams, TagItemsResult } from '../types';
import { ConflictError, NotFoundError, ValidationError } from '../domain/errors';
import { PermissionService } from './permission-service';

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

	async list(limit = 50, cursor?: number, prefix = '', category?: string) {
		const normalized = normalizeTag(prefix);
		if (prefix && !normalized) return { data: [], nextCursor: null };
		const rows = await this.tags.list(limit + 1, cursor, normalized, category);
		return { data: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1].id : null };
	}

	async get(id: number): Promise<TagRow> {
		const tag = await this.tags.findById(id);
		if (!tag) throw new NotFoundError('Tag no encontrado');

		return tag;
	}

	async getByName(name: string): Promise<TagRow> {
		return this.get(await this.resolveId(name));
	}

	async create(name: string, displayName: string | null, description: string | null, category: string, user: AuthUser): Promise<Pick<TagRow, 'id'>> {
		this.assertEditor(user);
		const parsed = TagInputSchema.safeParse(name);
		if (!parsed.success) throw new ValidationError('Invalid tag name');
		const normalized = normalizeTag(parsed.data);
		if ((await this.tags.findByName(normalized)) || (await this.tags.findAliasByName(normalized))) throw new ConflictError('Tag name already exists');

		return { id: await this.tags.create(normalized, displayName, description, category, user.id) };
	}

	async update(id: number, displayName: string, description: string | null | undefined, category: string, user: AuthUser): Promise<void> {
		this.assertEditor(user);
		await this.get(id);
		await this.tags.update(id, displayName, description, category, user.id);
	}

	async resolveId(name: string): Promise<number> {
		const ids = await this.tags.resolveTagIds([name]);

		if (!ids.length) throw new NotFoundError('Tag no encontrado');

		return ids[0];
	}

	async addAlias(alias: string, name: string, user: AuthUser): Promise<void> {
		this.assertEditor(user);
		const tagId = await this.resolveId(name);
		const normalized = normalizeTag(alias);
		if (!normalized || normalized.length > 40) throw new ValidationError('Invalid alias');
		if ((await this.tags.findByName(normalized)) || (await this.tags.findAliasByName(normalized))) throw new ConflictError('Alias name already exists');

		await this.tags.addAlias(normalized, tagId, user.id);
	}

	async updateAlias(id: number, alias: string, name: string, user: AuthUser): Promise<void> {
		this.assertEditor(user);
		await this.getAlias(id);
		const tagId = await this.resolveId(name);
		const normalized = normalizeTag(alias);
		if (!normalized || normalized.length > 40) throw new ValidationError('Invalid alias');
		const conflict = await this.tags.findAliasByName(normalized);
		if ((await this.tags.findByName(normalized)) || (conflict && conflict.id !== id)) throw new ConflictError('Alias name already exists');
		await this.tags.updateAlias(id, normalized, tagId);
	}

	async deleteAlias(id: number, user: AuthUser): Promise<void> {
		this.assertEditor(user);
		await this.getAlias(id);
		await this.tags.deleteAlias(id);
	}

	async getAlias(id: number): Promise<TagAliasRow & Pick<TagRow, 'normalized_name'>> {
		const alias = await this.tags.findAlias(id);
		if (!alias) throw new NotFoundError('Alias not found');
		return alias;
	}

	async listAliases(limit = 100, cursor?: number, prefix = '') {
		const normalized = normalizeTag(prefix);
		if (prefix && !normalized) return { data: [], nextCursor: null };
		const rows = await this.tags.listAliases(limit + 1, cursor, normalized);
		return { data: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1].id : null };
	}

	listHistory(tagId: number) {
		return this.tags.listHistory(tagId);
	}

	async revert(tagId: number, historyId: number, user: AuthUser): Promise<void> {
		this.assertEditor(user);
		await this.get(tagId);
		if (!(await this.tags.findHistory(tagId, historyId))) throw new NotFoundError('Tag history not found');
		await this.tags.revert(tagId, historyId, user.id);
	}

	private assertEditor(user: AuthUser): void {
		new PermissionService(this.db).require(user, 'edit_tags');
	}
}
