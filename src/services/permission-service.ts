// =========================================================================================================
// PERMISSION SERVICE
// =========================================================================================================
// Authorizes role management and resolves effective permissions from all assigned roles.
// =========================================================================================================

import type { DB } from '../db/client';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../domain/errors';
import { PermissionRepository } from '../repositories/permission-repository';
import type { AuthUser, UserId } from '../types';
import type { RoleRow } from '../db/schema';
import { PermissionSchema, type CreateRoleInput, type Permission, type UpdateRoleInput } from '../validators';

export class PermissionService {
	private readonly roles: PermissionRepository;

	constructor(db: DB) {
		this.roles = new PermissionRepository(db);
	}

	async forUser(userId: UserId): Promise<Permission[]> {
		return [...new Set((await this.roles.listPermissions(userId)).map((row) => row.permission).filter((value): value is Permission => PermissionSchema.safeParse(value).success))];
	}

	userRolesForLogin(userId: number): Promise<RoleRow[]> {
		return this.roles.userRoles(userId);
	}

	has(user: AuthUser | null, permission: Permission): boolean {
		return user?.status === 'active' && user.permissions.includes(permission);
	}

	require(user: AuthUser, permission: Permission): void {
		if (!this.has(user, permission)) throw new ForbiddenError('Permission denied');
	}

	async list(user: AuthUser) {
		this.require(user, 'manage_roles');
		const roles = await this.roles.listRoles();
		return Promise.all(roles.map(async (role) => ({ ...role, permissions: (await this.roles.rolePermissions(role.id)).map((row) => row.permission) })));
	}

	async userRoles(user: AuthUser, userId: UserId) {
		if (user.id !== userId) this.require(user, 'manage_roles');
		if (!(await this.roles.findUser(userId))) throw new NotFoundError('User not found');
		return this.roles.userRoles(userId);
	}

	async create(user: AuthUser, input: CreateRoleInput) {
		this.require(user, 'manage_roles');
		this.assertEditablePermissions(input.permissions);
		if (await this.roles.findRoleByName(input.name)) throw new ConflictError('Role already exists');
		return this.roles.createRole(input.name, input.permissions);
	}

	async update(user: AuthUser, roleId: number, input: UpdateRoleInput): Promise<void> {
		this.require(user, 'manage_roles');
		const role = await this.roles.findRole(roleId);
		if (!role) throw new NotFoundError('Role not found');
		if (role.managed) throw new ForbiddenError('Managed role');
		const permissions = input.permissions ?? (await this.roles.rolePermissions(roleId)).map((row) => PermissionSchema.parse(row.permission));
		this.assertEditablePermissions(permissions);
		const duplicate = await this.roles.findRoleByName(input.name ?? role.name);
		if (duplicate && duplicate.id !== roleId) throw new ConflictError('Role already exists');
		await this.roles.updateRole(roleId, input.name ?? role.name, permissions);
	}

	async delete(user: AuthUser, roleId: number): Promise<void> {
		this.require(user, 'manage_roles');
		const role = await this.roles.findRole(roleId);
		if (!role) throw new NotFoundError('Role not found');
		if (role.managed) throw new ForbiddenError('Managed role');
		await this.roles.deleteRole(roleId);
	}

	async assign(user: AuthUser, userId: UserId, roleId: number): Promise<void> {
		this.require(user, 'manage_roles');
		if (!(await this.roles.findUser(userId))) throw new NotFoundError('User not found');
		if (!(await this.roles.findRole(roleId))) throw new NotFoundError('Role not found');
		await this.roles.assign(userId, roleId);
	}

	async revoke(user: AuthUser, userId: UserId, roleId: number): Promise<void> {
		this.require(user, 'manage_roles');
		if (!(await this.roles.findUser(userId))) throw new NotFoundError('User not found');
		if (!(await this.roles.findRole(roleId))) throw new NotFoundError('Role not found');
		if (!(await this.roles.revoke(userId, roleId))) {
			if (!(await this.roles.userRoles(userId)).some((role) => role.id === roleId)) throw new NotFoundError('Role assignment not found');
			throw new ForbiddenError('Cannot revoke the base role or the last administrator');
		}
	}

	private assertEditablePermissions(permissions: readonly Permission[]): void {
		if (permissions.includes('manage_roles')) throw new ValidationError('Administrator permission is reserved');
	}
}
