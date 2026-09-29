// =========================================================================================================
// Apply the role migration in isolated D1 tests that bootstrap earlier schemas manually.
// =========================================================================================================

import permissionsSql from '../../migrations/0009_permissions.sql?raw';

export async function applyPermissions(db: D1Database): Promise<void> {
	const [migration, trigger] = permissionsSql.split('CREATE TRIGGER');
	const statements = migration
		.replace(/--[^\n]*/g, '')
		.split(';')
		.map((statement) => statement.trim())
		.filter(Boolean);
	await db.batch(statements.map((statement) => db.prepare(statement)));
	await db.prepare(`CREATE TRIGGER ${trigger.trim()}`).run();
}
