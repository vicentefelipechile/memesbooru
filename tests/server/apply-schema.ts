// =========================================================================================================
// Bootstrap the single-schema migration in isolated D1 tests.
// =========================================================================================================

import schemaSql from '../../migrations/0001_initial.sql?raw';

export async function applySchema(db: D1Database): Promise<void> {
	const [schema, ...triggers] = schemaSql.replace(/--[^\n]*/g, '').split(/(?=CREATE TRIGGER )/);
	const statements = schema
		.split(';')
		.map((statement) => statement.trim())
		.filter(Boolean);
	await db.batch(statements.map((statement) => db.prepare(statement)));
	for (const trigger of triggers) await db.prepare(trigger.trim()).run();
}
