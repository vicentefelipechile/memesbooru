// =========================================================================================================
// PROFILE SERVICE
// =========================================================================================================
// Public profile reads and self-service editing.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import type { DB } from '../db/client';
import { NotFoundError, ValidationError } from '../domain/errors';
import { decodeCursor, encodeCursor } from '../helpers/cursor';
import { ProfileRepository, type ProfilePostCursor } from '../repositories/profile-repository';
import { PermissionService } from './permission-service';
import { ProfileCursorSchema } from '../validators';
import type { ProfileInput, ProfilePostsQueryInput } from '../validators';
import type { AuthUser, ProfilePostsResult, PublicProfile, JsonValue } from '../types';

// =========================================================================================================
// Service
// =========================================================================================================

export class ProfileService {
	private readonly profiles: ProfileRepository;
	private readonly permissions: PermissionService;

	constructor(db: DB) {
		this.profiles = new ProfileRepository(db);
		this.permissions = new PermissionService(db);
	}

	async get(username: string): Promise<PublicProfile> {
		const profile = await this.profiles.findByUsername(username);
		if (!profile) throw new NotFoundError('Profile not found');

		return { ...profile, roles: (await this.permissions.userRolesForLogin(profile.id)).map((role) => role.name) };
	}

	async posts(username: string, query: ProfilePostsQueryInput): Promise<ProfilePostsResult> {
		const profile = await this.get(username);
		const decoded = query.cursor ? ProfileCursorSchema.safeParse(decodeCursor<JsonValue>(query.cursor)) : null;
		if (decoded && !decoded.success) throw new ValidationError('Invalid profile cursor');

		const cursor: ProfilePostCursor | null = decoded?.success ? decoded.data : null;
		const rows = await this.profiles.listPosts(profile.id, query.limit + 1, cursor);
		const visible = rows.slice(0, query.limit);
		const last = visible.at(-1);

		return {
			data: visible.map(({ public_id, low_variant_key, preview_data, score, favorite_count, media_type }) => ({ public_id, low_variant_key, preview_data, score, favorite_count, media_type })),
			nextCursor: rows.length > query.limit && last ? encodeCursor({ id: last.id, created_at: last.created_at } satisfies ProfilePostCursor) : null,
		};
	}

	async updateSelf(user: AuthUser, input: ProfileInput): Promise<PublicProfile> {
		await this.profiles.update(user.id, input);
		const profile = await this.profiles.findById(user.id);
		if (!profile) throw new NotFoundError('Profile not found');

		return { ...profile, roles: (await this.permissions.userRolesForLogin(user.id)).map((role) => role.name) };
	}
}
