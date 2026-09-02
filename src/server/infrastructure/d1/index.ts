export type D1 = D1Database;

// Helpers para queries preparadas — evita SQL injection, usa ? placeholders
export async function first<T>(db: D1, sql: string, params: unknown[] = []): Promise<T | null> {
  const stmt = db.prepare(sql).bind(...params);
  const res = await stmt.first<T>();
  return res ?? null;
}
export async function all<T>(db: D1, sql: string, params: unknown[] = []): Promise<T[]> {
  const stmt = db.prepare(sql).bind(...params);
  const { results } = await stmt.all<T>();
  return results ?? [];
}
export async function run(db: D1, sql: string, params: unknown[] = []): Promise<D1Result> {
  return db.prepare(sql).bind(...params).run();
}
export async function batchRun(db: D1, statements: D1PreparedStatement[]): Promise<D1Result[]> {
  // D1.batch es secuencial pero reduce round trips (PLAN 9)
  return db.batch(statements);
}
