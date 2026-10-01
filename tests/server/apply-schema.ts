// =========================================================================================================
// Bootstrap the single-schema migration in isolated D1 tests.
// =========================================================================================================

import schemaSql from '../../migrations/0001_initial.sql?raw';

export async function applySchema(db: D1Database): Promise<void> {
	const [schema, trigger] = schemaSql.split('CREATE TRIGGER');
	const statements = schema
		.replace(/--[^\n]*/g, '')
		.split(';')
		.map((statement) => statement.trim())
		.filter(Boolean);
	await db.batch(statements.map((statement) => db.prepare(statement)));
	await db.prepare(`CREATE TRIGGER ${trigger.trim()}`).run();
}
