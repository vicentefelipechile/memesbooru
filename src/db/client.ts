// =========================================================================================================
// DB CLIENT (v2)
// =========================================================================================================
// Typed D1 client — ONLY import used by repositories. Never c.env.DB directly in routes/services.
// =========================================================================================================

// =========================================================================================================
// Types
// =========================================================================================================

export type DB = D1Database;
export type SqlParam = string | number | boolean | null | ArrayBuffer | Uint8Array;

// =========================================================================================================
// Helpers
// =========================================================================================================

export async function queryOne<T>(db: DB, sql: string, params: readonly SqlParam[]): Promise<T | null> {
	return (
		(await db
			.prepare(sql)
			.bind(...params)
			.first<T>()) ?? null
	);
}

export async function queryAll<T>(db: DB, sql: string, params: readonly SqlParam[]): Promise<T[]> {
	const { results } = await db
		.prepare(sql)
		.bind(...params)
		.all<T>();
	return results ?? [];
}

export async function execute(db: DB, sql: string, params: readonly SqlParam[]): Promise<D1Result> {
	return db
		.prepare(sql)
		.bind(...params)
		.run();
}

export async function batch(db: DB, statements: D1PreparedStatement[]): Promise<D1Result[]> {
	return db.batch(statements);
}
