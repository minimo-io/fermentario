import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { RunResult, SqlDb, SqlStatement, SqlValue } from './sqlite';

/**
 * The browser side of the database: SQLite compiled to WebAssembly, with the
 * file in OPFS (the WebView's private storage). No Node, no server, no Rust.
 *
 * Two things about the engine are worth knowing:
 *
 *  - It exposes `oo1.DB`, not `oo1.Opener`, and `prepare()` takes only the SQL
 *    text: binding is `stmt.bind(values)` and rows come from
 *    `stmt.get()` / `stmt.all()`. Statements are cached by SQL text because
 *    `journal.ts` prepares the same string on every note.
 *  - A BLOB comes back as `Uint8Array` rather than Node's `Buffer`.
 *
 * The gate in `scripts/sqlite-gate.mjs` confirmed that this build has FTS5 with
 * the porter tokenizer, which is what makes BM25 retrieval and the existing
 * `notes_fts` schema work unchanged on the phone.
 */

type Sqlite3 = Awaited<ReturnType<typeof sqlite3InitModule>>;

let sqlite3Promise: Promise<Sqlite3> | null = null;

function init(): Promise<Sqlite3> {
	sqlite3Promise ??= sqlite3InitModule();
	return sqlite3Promise;
}

export function isWasmEngine(): boolean {
	return typeof window !== 'undefined';
}

function toBindable(v: SqlValue): SqlValue {
	// A plain view over a pooled buffer is fine; oo1 copies the bytes.
	return v instanceof Uint8Array ? v : v;
}

/** The part of an oo1 statement this adapter uses. The library's own type for
 *  it cannot be indexed out of the `oo1` namespace, which is exported as a
 *  value. */
interface Oo1Stmt {
	bind(values: unknown[]): unknown;
	step(): boolean;
	/** Step to the end of the statement and rewind it in one call. */
	stepReset(): boolean;
	/** `get({})` returns the current row as an object; a bare `get()` reads
	 *  column 0 and throws. */
	get(rowTarget?: unknown): unknown;
	reset(): unknown;
	finalize(): unknown;
}

export async function createWasmDb(filename: string): Promise<SqlDb> {
	const sqlite3 = await init();

	// Persistence is the whole point, and getting it wrong fails silently: the
	// default `opfs` VFS needs a Web Worker, so on the main thread it gives a
	// database that reads and writes fine and forgets everything on the next
	// launch. The SAH-pool VFS is the one that persists here.
	let vfs: string | undefined;
	const opfs = (
		sqlite3 as unknown as {
			opfs?: { installOpfsSAHPoolVfs?: (o: Record<string, unknown>) => Promise<unknown> };
		}
	).opfs;
	if (typeof opfs?.installOpfsSAHPoolVfs === 'function') {
		await opfs.installOpfsSAHPoolVfs({ initialCapacity: 8 });
		vfs = 'opfs-sahpool';
	}

	// No silent fallback to an in-memory database. An empty journal that looks
	// like it works is far worse than a loud failure: it was exactly what hid
	// the fact that a path in Node opens as an empty database, because the
	// `unix` VFS in this build is a virtual in-memory one.
	const db = new sqlite3.oo1.DB(filename, 'c', vfs);
	db.exec('PRAGMA foreign_keys = ON');
	const vfsInUse = (db as unknown as { dbVfsName?: () => string }).dbVfsName?.() ?? 'unknown';

	// Compiled statements, keyed by SQL. journal.ts prepares the same text for
	// every note, and oo1 has no internal statement cache.
	const cache = new Map<string, Oo1Stmt>();

	function stmtFor(sql: string): Oo1Stmt {
		let s = cache.get(sql);
		if (!s) {
			s = db.prepare(sql) as unknown as Oo1Stmt;
			cache.set(sql, s);
		}
		return s;
	}

	function bindValues(stmt: ReturnType<typeof stmtFor>, params: SqlValue[]) {
		stmt.reset();
		if (params.length) stmt.bind(params.map(toBindable));
		return stmt;
	}

	const handle: SqlDb = {
		filename,
		vfsName: vfsInUse,
		exec(sql: string) {
			// exec() with a string cannot take parameters, and the import path
			// inlines a generated path, so a plain exec is correct here.
			db.exec(sql);
		},
		prepare(sql: string): SqlStatement {
			return {
				run(...params: SqlValue[]): RunResult {
					const stmt = bindValues(stmtFor(sql), params);
					stmt.stepReset();
					return { changes: db.changes() };
				},
				get<T>(...params: SqlValue[]) {
					const stmt = bindValues(stmtFor(sql), params);
					// oo1 requires a successful step() before get(), and `get({})` is
					// how the object row is selected: a bare get() reads column 0 and
					// throws "Column index is out of range".
					const row = stmt.step() ? stmt.get({} as Record<string, never>) : undefined;
					stmt.reset();
					return (row ?? undefined) as T | undefined;
				},
				all<T>(...params: SqlValue[]) {
					const stmt = bindValues(stmtFor(sql), params);
					const rows: T[] = [];
					while (stmt.step()) rows.push(stmt.get({} as Record<string, never>) as T);
					stmt.reset();
					return rows;
				}
			};
		},
		transaction<T>(fn: () => T): T {
			// oo1 has a helper, but it wants its own callback shape. Doing it by
			// hand keeps the interface's zero-argument signature.
			db.exec('BEGIN');
			try {
				const out = fn();
				db.exec('COMMIT');
				return out;
			} catch (err) {
				try {
					db.exec('ROLLBACK');
				} catch {
					// No transaction left open.
				}
				throw err;
			}
		},
		pragma(statement: string, query = false): unknown {
			if (!query) {
				db.exec(`PRAGMA ${statement}`);
				return undefined;
			}
			return db.selectValue(`PRAGMA ${statement}`);
		},
		close() {
			for (const s of cache.values()) {
				try {
					s.finalize();
				} catch {
					// Already finalized.
				}
			}
			cache.clear();
			try {
				db.close();
			} catch {
				// Already closed.
			}
		}
	};

	return handle;
}

/** The OPFS file the journal lives in, per origin. */
export const JOURNAL_FILE = 'file:fermentario.db';
