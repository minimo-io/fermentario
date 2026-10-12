/**
 * The gate for task 020: can the WebAssembly SQLite build run this app's real
 * DDL? Not "does it have FTS5" — the app's schema is stricter than that:
 *
 *   CREATE VIRTUAL TABLE notes_fts USING fts5(
 *     content, note_id UNINDEXED, tokenize = 'porter unicode61'
 *   );
 *
 * So the porter tokenizer has to be there too, and a BM25 query has to work.
 *
 *   node scripts/sqlite-gate.mjs
 */
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

const DDL = `
CREATE TABLE notes (
	id         TEXT PRIMARY KEY,
	content    TEXT NOT NULL,
	created_at INTEGER NOT NULL,
	updated_at INTEGER NOT NULL
);
CREATE TABLE note_vectors (
	note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
	vector  BLOB NOT NULL
);
CREATE TABLE note_tags (
	note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
	tag     TEXT NOT NULL,
	PRIMARY KEY (note_id, tag)
);
CREATE VIRTUAL TABLE notes_fts USING fts5(
	content,
	note_id UNINDEXED,
	tokenize = 'porter unicode61'
);
`;

const sqlite3 = await sqlite3InitModule();
console.log('sqlite version:', sqlite3.version.libVersion);

const vfsRaw = sqlite3.capi.sqlite3_js_vfs_list?.() ?? '';
const vfsList = Array.isArray(vfsRaw) ? vfsRaw.join(', ') : String(vfsRaw);
console.log('vfs:', vfsList || '(none listed)');

const checks = [];
const check = (name, fn) => {
	try {
		const detail = fn();
		checks.push({ name, ok: true, detail: detail ?? '' });
	} catch (err) {
		checks.push({ name, ok: false, detail: String(err?.message ?? err) });
	}
};

let db;
check('open a database', () => {
	// 3.53 exposes oo1.DB; there is no oo1.Opener in this build.
	db = new sqlite3.oo1.DB(':memory:', 'c');
	return `opened ${db.dbName()}`;
});

if (db) {
	check('run the app DDL (fts5 + porter unicode61)', () => {
		db.exec(DDL);
		return 'all four tables created';
	});

	check('porter tokenizer stems', () => {
		// 'running' must match 'run' only if the porter tokenizer is active.
		db.exec({
			sql: "INSERT INTO notes_fts (content, note_id) VALUES ('I was running slowly', 'n1')"
		});
		const row = db.prepare({
			sql: "SELECT note_id FROM notes_fts WHERE notes_fts MATCH ?",
			bind: ['"run"']
		}).get();
		return row ? `matched ${row.note_id}` : 'NO MATCH — porter tokenizer missing';
	});

	check('bm25 ranking', () => {
		const rows = db
			.prepare({
				sql: `SELECT note_id, bm25(notes_fts) AS score FROM notes_fts
				      WHERE notes_fts MATCH ? ORDER BY score LIMIT 5`,
				bind: ['"kayak" OR "run"']
			})
			.all();
		return `${rows.length} row(s), score ${rows[0]?.score?.toFixed(4) ?? 'n/a'}`;
	});

	check('write and read a 1536-byte blob', () => {
		const v = new Float32Array(384).fill(0.5);
		const buf = Buffer.from(v.buffer);
		db.exec({ sql: 'INSERT INTO notes (id, content, created_at, updated_at) VALUES (?,?,?,?)', bind: ['n2', 'x', 1, 1] });
		db.exec({ sql: 'INSERT INTO note_vectors (note_id, vector) VALUES (?,?)', bind: ['n2', buf] });
		const back = db.prepare({ sql: 'SELECT vector FROM note_vectors WHERE note_id = ?', bind: ['n2'] }).get();
		const got = new Uint8Array(back.vector);
		let same = got.length === buf.length;
		for (let i = 0; same && i < buf.length; i++) same = got[i] === buf[i];
		return same ? `${got.length} bytes, byte-identical` : `MISMATCH (${got.length} vs ${buf.length})`;
	});

	check('parameterised statement returns objects', () => {
		const row = db.prepare({ sql: 'SELECT id, content FROM notes WHERE id = ?', bind: ['n2'] }).get();
		return row && row.id === 'n2' ? `got {id: ${row.id}}` : 'no object row';
	});

	check('named parameters', () => {
		const row = db
			.prepare({ sql: 'SELECT :a + :b AS s', bind: { ':a': 2, ':b': 40 } })
			.get();
		return `a+b = ${row?.s}`;
	});

	check('changes() after a write', () => {
		db.exec({ sql: "INSERT INTO notes_fts (content, note_id) VALUES ('another', 'n3')" });
		const r = db.prepare({ sql: "SELECT changes() AS c" }).get();
		return `changes() = ${r?.c}`;
	});

	check('OPFS VFS reachable in a browser', () => {
		if (!sqlite3.opfs) throw new Error('no sqlite3.opfs utility object');
		const util = Object.keys(sqlite3.opfs).join(', ');
		return `sqlite3.opfs exposes: ${util}`;
	});

	db.close();
}

console.log('');
for (const c of checks) console.log(`${c.ok ? 'ok  ' : 'FAIL'}  ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
const failed = checks.filter((c) => !c.ok);
console.log('');
if (failed.length) {
	console.log(`${failed.length}/${checks.length} checks FAILED. Task 020 needs a fallback engine.`);
	process.exit(1);
}
console.log(`${checks.length}/${checks.length} checks passed. FTS5 with porter works in the WebAssembly build.`);
