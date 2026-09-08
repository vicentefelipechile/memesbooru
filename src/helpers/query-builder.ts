// =========================================================================================================
// QUERY BUILDER (v2)
// =========================================================================================================
// Fluent builder keeping clauses and params atomic. Use whereIf for optional filters.
// =========================================================================================================

// =========================================================================================================
// Imports
// =========================================================================================================

import type { SqlParam } from '../db/client';

// =========================================================================================================
// Types
// =========================================================================================================

export type BuiltQuery = {
	sql: string;
	params: SqlParam[];
};

// =========================================================================================================
// Builder
// =========================================================================================================

export class QueryBuilder {
	private clauses: string[] = [];
	private params: SqlParam[] = [];
	private orderClause = '';
	private limitClause = '';
	private offsetClause = '';

	where(sql: string, ...params: SqlParam[]): this {
		this.clauses.push(sql);
		this.params.push(...params);
		return this;
	}

	whereIf(condition: boolean, sql: string, ...params: SqlParam[]): this {
		if (condition) this.where(sql, ...params);
		return this;
	}

	orderBy(column: string, direction: 'asc' | 'desc' = 'asc', allowed?: readonly string[]): this {
		if (allowed && !allowed.includes(column)) throw new Error(`Invalid sort column: ${column}`);
		if (!/^[a-zA-Z0-9_.]+$/.test(column)) throw new Error(`Invalid column: ${column}`);
		this.orderClause = `ORDER BY ${column} ${direction.toUpperCase()}`;
		return this;
	}

	paginate(page: number, limit: number): this {
		this.limitClause = `LIMIT ?`;
		this.params.push(limit);
		this.offsetClause = `OFFSET ?`;
		this.params.push((page - 1) * limit);
		return this;
	}

	build(baseSql: string): BuiltQuery {
		let sql = baseSql;
		if (this.clauses.length) sql += ` WHERE ${this.clauses.join(' AND ')}`;
		if (this.orderClause) sql += ` ${this.orderClause}`;
		if (this.limitClause) sql += ` ${this.limitClause}`;
		if (this.offsetClause) sql += ` ${this.offsetClause}`;
		return { sql, params: [...this.params] };
	}
}
