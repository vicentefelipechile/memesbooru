// =========================================================================================================
// PERMISSION REPOSITORY
// =========================================================================================================
// Role, membership and permission SQL.
// =========================================================================================================

import { batch, execute, queryAll, queryOne, type DB } from '../db/client';
import type { RoleRow, RolePermissionRow, UserRoleRow, UserRow } from '../db/schema';
import type { Permission } from '../validators';

export class PermissionRepository {
	constructor(private readonly db: DB) {}

	listRoles(): Promise<RoleRow[]> {
		return queryAll<RoleRow>(this.db, 'SELECT id, name, position, managed FROM roles ORDER BY position DESC, id ASC', []);
	}

	findRole(id: RoleRow['id']): Promise<RoleRow | null> {
		return queryOne<RoleRow>(this.db, 'SELECT id, name, position, managed FROM roles WHERE id = ?', [id]);
	}

	findRoleByName(name: string): Promise<RoleRow | null> {
		return queryOne<RoleRow>(this.db, 'SELECT id, name, position, managed FROM roles WHERE name = ? COLLATE NOCASE', [name]);
	}

	findUser(id: UserRow['id']): Promise<Pick<UserRow, 'id'> | null> {
		return queryOne<Pick<UserRow, 'id'>>(this.db, 'SELECT id FROM users WHERE id = ?', [id]);
	}

	listPermissions(userId: UserRoleRow['user_id']): Promise<RolePermissionRow[]> {
		return queryAll<RolePermissionRow>(this.db, 'SELECT DISTINCT rp.permission, rp.role_id FROM user_roles ur JOIN role_permissions rp ON rp.role_id = ur.role_id JOIN users u ON u.id = ur.user_id WHERE ur.user_id = ? AND u.status = ?', [
			userId,
			'active',
		]);
	}

	rolePermissions(roleId: RoleRow['id']): Promise<RolePermissionRow[]> {
		return queryAll<RolePermissionRow>(this.db, 'SELECT role_id, permission FROM role_permissions WHERE role_id = ?', [roleId]);
	}

	userRoles(userId: UserRoleRow['user_id']): Promise<RoleRow[]> {
		return queryAll<RoleRow>(this.db, 'SELECT r.id, r.name, r.position, r.managed FROM roles r JOIN user_roles ur ON ur.role_id = r.id WHERE ur.user_id = ? ORDER BY r.position DESC, r.id ASC', [userId]);
	}

	async createRole(name: string, permissions: readonly Permission[]): Promise<RoleRow> {
		const statements = [this.db.prepare('INSERT INTO roles (name, position) VALUES (?, 1)').bind(name)];
		for (const permission of new Set(permissions)) statements.push(this.db.prepare('INSERT INTO role_permissions (role_id, permission) VALUES (last_insert_rowid(), ?)').bind(permission));
		const results = await batch(this.db, statements);
		const role = await this.findRole(results[0].meta.last_row_id);
		if (!role) throw new Error('Role creation failed');
		return role;
	}

	async updateRole(id: RoleRow['id'], name: string, permissions: readonly Permission[]): Promise<void> {
		await batch(this.db, [
			this.db.prepare('UPDATE roles SET name = ? WHERE id = ? AND managed = 0').bind(name, id),
			this.db.prepare('DELETE FROM role_permissions WHERE role_id = ?').bind(id),
			...[...new Set(permissions)].map((permission) => this.db.prepare('INSERT INTO role_permissions (role_id, permission) VALUES (?, ?)').bind(id, permission)),
		]);
	}

	async deleteRole(id: RoleRow['id']): Promise<void> {
		await execute(this.db, 'DELETE FROM roles WHERE id = ? AND managed = 0', [id]);
	}

	async assign(userId: UserRoleRow['user_id'], roleId: UserRoleRow['role_id']): Promise<void> {
		await execute(this.db, 'INSERT OR IGNORE INTO user_roles (user_id, role_id) VALUES (?, ?)', [userId, roleId]);
	}

	async revoke(userId: UserRoleRow['user_id'], roleId: UserRoleRow['role_id']): Promise<boolean> {
		const result = await execute(this.db, 'DELETE FROM user_roles WHERE user_id = ? AND role_id = ? AND role_id != 4 AND (role_id != 1 OR (SELECT COUNT(*) FROM user_roles WHERE role_id = 1) > 1)', [userId, roleId]);
		return (result.meta.changes ?? 0) > 0;
	}
}
