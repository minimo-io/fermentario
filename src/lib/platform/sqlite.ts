/**
 * The database interface for the Node server.
 *
 * The web app runs better-sqlite3 in Node. `createJournal()` in `./journal`
 * holds the queries, and the adapter under `src/lib/server` supplies the
 * handle.
 *
 * The shape is deliberately the small part of better-sqlite3 that this app
 * uses, because that keeps every query in `journal.ts` written exactly as it
 * was written for Node.
 */

export type SqlValue = string | number | bigint | Uint8Array | null;

export interface RunResult {
	/** Rows affected. better-sqlite3 calls this `changes`. */
	changes: number;
}

export interface SqlStatement {
	/** Run a statement that returns nothing. */
	run(...params: SqlValue[]): RunResult;
	/** One row as an object, or `undefined` when there is none. */
	get<T = Record<string, SqlValue>>(...params: SqlValue[]): T | undefined;
	/** Every row as an object. */
	all<T = Record<string, SqlValue>>(...params: SqlValue[]): T[];
	/** Drop the statement. Optional: adapters may cache instead. */
	finalize?(): void;
}

export interface SqlDb {
	exec(sql: string): void;
	/** Compile a statement. Adapters may cache by SQL text. */
	prepare(sql: string): SqlStatement;
	/** Run `fn` in a transaction, rolling back if it throws. */
	transaction<T>(fn: () => T): T;
	/**
	 * `PRAGMA` statements. `query` runs it and returns the first column of the
	 * first row, which is what `quick_check` needs; the rest are called for
	 * their effect only.
	 */
	pragma(statement: string, query?: boolean): unknown;
	close(): void;
	/** The file this handle is on, for diagnostics. */
	readonly filename: string;
	/**
	 * Which storage backend is in use. It decides whether writes survive a
	 * restart, and a wrong choice fails silently, so it is reported.
	 */
	readonly vfsName: string;
}
