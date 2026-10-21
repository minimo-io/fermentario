import Database from 'better-sqlite3';
import type { RunResult, SqlDb, SqlStatement, SqlValue } from '../platform/sqlite.ts';

/**
 * The Node side of the database: better-sqlite3, which is a native addon and
 * therefore only ever runs in the web app's server process.
 */
export function createNodeDb(filename: string): SqlDb {
	const raw = new Database(filename);

	return {
		filename,
		vfsName: 'node',
		exec(sql: string) {
			raw.exec(sql);
		},
		prepare(sql: string): SqlStatement {
			const stmt = raw.prepare(sql);
			const toParams = (params: SqlValue[]) => params.map((p) => (p instanceof Uint8Array ? p : p));
			return {
				run(...params: SqlValue[]): RunResult {
					const info = stmt.run(...toParams(params));
					return { changes: info.changes };
				},
				get<T>(...params: SqlValue[]) {
					return stmt.get(...toParams(params)) as T | undefined;
				},
				all<T>(...params: SqlValue[]) {
					return stmt.all(...toParams(params)) as T[];
				},
				finalize() {
					// better-sqlite3 statements are finalised by GC; explicit
					// finalisation here would break the cached-statement use in
					// journal.ts, which prepares the same text repeatedly.
				}
			};
		},
		transaction<T>(fn: () => T): T {
			return raw.transaction(fn)();
		},
		pragma(statement: string, query = false): unknown {
			return raw.pragma(statement, query ? { simple: true } : undefined);
		},
		close() {
			raw.close();
		}
	};
}
