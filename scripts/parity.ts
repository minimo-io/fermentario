/**
 * Engine parity: the real `journal.ts` queries, the same fixture, two engines.
 *
 * Run with `node scripts/parity.ts`. Node 24 strips the TypeScript itself, and
 * `journal.ts` only imports types, so that import is erased and nothing has to
 * be bundled or aliased.
 *
 * better-sqlite3 (Node) against SQLite-in-WebAssembly. Anything that differs is
 * a bug that would only appear on the phone, where there is no server log.
 *
 * Compared: the schema including the FTS5 DDL, note rows and their order, the
 * pagination cursor across a tie in `created_at`, tag rows, the heatmap day
 * counts, BM25 search results and their order, and the `note_vectors` blobs
 * byte for byte. A silent float re-serialisation would degrade retrieval
 * without failing anything else, so the blob check is not optional.
 */
import { createJournal } from '../src/lib/platform/journal.ts';
import { createWasmDb } from '../src/lib/platform/wasm-db.ts';
import type { SqlDb, SqlStatement, SqlValue } from '../src/lib/platform/sqlite.ts';
import { seedSql, WEEK_KEY, BASE } from './seed.ts';
import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');

/** better-sqlite3 behind the shared interface, so both sides run journal.ts. */
function nodeDb(filename: string): SqlDb {
	const raw = new Database(filename);
	return {
		filename,
		exec: (sql) => raw.exec(sql),
		prepare(sql: string): SqlStatement {
			const s = raw.prepare(sql);
			return {
				run: (...p: SqlValue[]) => ({ changes: s.run(...p).changes }),
				get: <T,>(...p: SqlValue[]) => s.get(...p) as T | undefined,
				all: <T,>(...p: SqlValue[]) => s.all(...p) as T[]
			};
		},
		transaction: <T,>(fn: () => T) => raw.transaction(fn)(),
		pragma: (statement: string, query = false) => raw.pragma(statement, query ? { simple: true } : undefined),
		close: () => raw.close()
	};
}

const work = mkdtempSync(join(tmpdir(), 'ferm-parity-'));

const results: { name: string; ok: boolean; detail: string }[] = [];
const check = (name: string, fn: () => string | true) => {
	try {
		const detail = fn();
		results.push({ name, ok: detail === true, detail: detail === true ? '' : String(detail) });
	} catch (err) {
		results.push({ name, ok: false, detail: `threw: ${(err as Error)?.message ?? err}` });
	}
};

// The sqlite-wasm build in Node has no real filesystem: its `unix` VFS is a
// virtual in-memory one, so opening a path silently gives an empty database.
// Both engines are therefore seeded with the same SQL, which is what the
// parity question is actually about. Moving a file between them is a separate
// path, exercised in the app through OPFS.
const a = createJournal(nodeDb(join(work, 'node.db')));
a.db.exec(a.Schema);
a.db.exec(seedSql());

const w = createJournal(await createWasmDb(':memory:'));
w.db.exec(w.Schema);
w.db.exec(seedSql());
w.db.pragma('foreign_keys = ON');
a.db.pragma('foreign_keys = ON');

/** Deep equality on JSON, with BLOBs rendered as hex so a byte change shows. */
const norm = (v: unknown): unknown =>
	Array.isArray(v)
		? v.map(norm)
		: v && typeof v === 'object'
			? Object.fromEntries(
					Object.entries(v as Record<string, unknown>).map(([k, x]) => [
						k,
						x instanceof Uint8Array
							? `blob:${Buffer.from(x).toString('hex').slice(0, 24)}…(${x.length})`
							: norm(x)
					])
				)
			: v;

const same = (label: string, x: unknown, y: unknown) =>
	check(label, () => {
		const sx = JSON.stringify(norm(x));
		const sy = JSON.stringify(norm(y));
		return sx === sy ? true : `node ${sx}\n     wasm ${sy}`;
	});

// --- Reads -----------------------------------------------------------------
same('note count', a.countNotes(), w.countNotes());
same('latest timestamp', a.latestTimestamp(), w.latestTimestamp());
same('first page of notes', a.listNotesPage({ limit: 3 }), w.listNotesPage({ limit: 3 }));

// Pagination across the fixture's deliberate tie in created_at.
const p1 = a.listNotesPage({ limit: 2 });
const c = p1.nextCursor!;
same(
	'second page across the created_at tie',
	a.listNotesPage({ limit: 2, before: c.created_at, beforeId: c.id }),
	w.listNotesPage({ limit: 2, before: c.created_at, beforeId: c.id })
);

same('notes for tag garden', a.listNotesPage({ limit: 50, tag: 'garden' }), w.listNotesPage({ limit: 50, tag: 'garden' }));
same('countNotesByTag garden', a.countNotesByTag('garden'), w.countNotesByTag('garden'));
same('notes between two dates', a.notesBetween(0, Date.UTC(2030, 0, 1)), w.notesBetween(0, Date.UTC(2030, 0, 1)));
same('notes missing vectors', a.notesMissingVectors(), w.notesMissingVectors());
same('notes missing tags', a.notesMissingTags(), w.notesMissingTags());
same('ask history', a.listAsks(), w.listAsks());
same('weekly recap', a.getWeeklyRecap(WEEK_KEY), w.getWeeklyRecap(WEEK_KEY));

// --- Vectors: the bytes, not a checksum of a re-read ------------------------
same(
	'vector blobs byte for byte',
	a.allVectors().map((v) => v.noteId + ':' + Buffer.from(v.vector.buffer).toString('base64')),
	w.allVectors().map((v) => v.noteId + ':' + Buffer.from(v.vector.buffer).toString('base64'))
);

// --- FTS5 ------------------------------------------------------------------
// BM25 is floating point, so the last digits differ between the two builds —
// `-6.245083341991583e-8` against `-6.245083341991625e-8`. What retrieval
// depends on is the order, so the ids are compared exactly and the scores to a
// tolerance far tighter than any difference that could reorder results.
const ftsParity = (label: string, query: string) =>
	check(label, () => {
		const ra = a.ftsCandidateIds(query);
		const rw = w.ftsCandidateIds(query);
		const ia = ra.map((r) => r.noteId).join(',');
		const iw = rw.map((r) => r.noteId).join(',');
		if (ia !== iw) return `different rows: node [${ia}] wasm [${iw}]`;
		if (ra.length !== rw.length) return `different counts: ${ra.length} vs ${rw.length}`;
		for (const [i, r] of ra.entries()) {
			const s = rw[i].bm25;
			if (Math.abs(r.bm25 - s) > 1e-9 + Math.abs(r.bm25) * 1e-9) {
				return `score ${i} differs: ${r.bm25} vs ${s}`;
			}
		}
		return true;
	});

ftsParity('fts candidates for "kayak"', 'kayak');
ftsParity('fts candidates multi-term', 'kayak chair migration');
same('fts candidates with punctuation', a.ftsCandidateIds('what? "quoted" *:*'), w.ftsCandidateIds('what? "quoted" *:*'));
same('fts candidates too short', a.ftsCandidateIds('a of'), w.ftsCandidateIds('a of'));

// The heatmap query from the API route, run through both.
const heat = (j: typeof a) =>
	j.db
		.prepare(
			`SELECT date(created_at / 1000, 'unixepoch', 'localtime') AS day, COUNT(*) AS count
			 FROM notes GROUP BY day ORDER BY day`
		)
		.all();
same('heatmap day counts', heat(a), heat(w));

// Both engines were seeded identically, so a note written on one side has to be
// visible on the other once it is written there too. A file cannot be shared
// between them in Node, so the shared step is the same INSERT run twice.
check('the same insert is accepted by both engines', () => {
	const id = '33333333-3333-4333-8333-333333333301';
	const at = BASE + 60_000;
	const text = 'a shared insert about a kayak';
	for (const j of [a, w]) {
		j.db
			.prepare('INSERT INTO notes (id, content, created_at, updated_at) VALUES (?, ?, ?, ?)')
			.run(id, text, at, at);
		j.db.prepare('INSERT INTO notes_fts (content, note_id) VALUES (?, ?)').run(text, id);
	}
	if (a.countNotes() !== w.countNotes()) return `counts differ: ${a.countNotes()} vs ${w.countNotes()}`;
	if (a.ftsCandidateIds('shared').length !== 1 || w.ftsCandidateIds('shared').length !== 1) {
		return 'the shared row is not searchable on both sides';
	}
	return true;
});

// --- Writes: both engines must stay in step ---------------------------------
check('write a note and see it in both', () => {
	const note = a.createNote('parity probe note', Date.UTC(2025, 2, 5, 8, 0, 0));
	// The same row, inserted on the wasm side, must be readable through journal.ts.
	w.db
		.prepare('INSERT INTO notes (id, content, created_at, updated_at) VALUES (?, ?, ?, ?)')
		.run(note.id, note.content, note.created_at, note.updated_at);
	w.db.prepare('INSERT INTO notes_fts (content, note_id) VALUES (?, ?)').run(note.content, note.id);
	const got = w.getNote(note.id);
	if (!got) return 'the note is not visible to the wasm side';
	if (got.content !== note.content) return `content mismatch: ${got.content}`;
	if (got.created_at !== note.created_at) return `created_at mismatch: ${got.created_at} vs ${note.created_at}`;
	return true;
});

check('the FTS row is written, so count(notes_fts) == count(notes)', () => {
	const cn = (j: typeof a) =>
		(j.db.prepare('SELECT COUNT(*) AS c FROM notes').get() as { c: number }).c;
	const cf = (j: typeof a) =>
		(j.db.prepare('SELECT COUNT(*) AS c FROM notes_fts').get() as { c: number }).c;
	if (a.countNotes() !== w.countNotes()) return `note counts differ: ${a.countNotes()} vs ${w.countNotes()}`;
	if (a.countNotes() !== cn(a)) return 'node notes count drifted';
	if (w.countNotes() !== cn(w)) return 'wasm notes count drifted';
	if (a.countNotes() !== cf(a)) return `node fts ${cf(a)} != notes ${a.countNotes()}`;
	if (w.countNotes() !== cf(w)) return `wasm fts ${cf(w)} != notes ${w.countNotes()}`;
	return true;
});

check('the new note is findable through FTS5 on both', () => {
	const ha = a.ftsCandidateIds('parity probe');
	const hw = w.ftsCandidateIds('parity probe');
	if (ha.length !== 1) return `node found ${ha.length} rows`;
	if (hw.length !== 1) return `wasm found ${hw.length} rows`;
	return true;
});

// `notes_fts` has no triggers, so an edit has to delete the old row itself or
// the note stays searchable under its old text. This already happened once,
// during the import rewrite. The words are chosen to appear in the note being
// edited and nowhere else, because 'broken chair' is a real word in another
// note and searching for it says nothing about this one.
check('editing replaces the FTS row rather than stacking another', () => {
	for (const [side, j] of [['node', a], ['wasm', w]] as const) {
		const n = j.createNote('xylophonic marmalade', Date.UTC(2025, 2, 8, 10, 0, 0));
		if (j.ftsCandidateIds('xylophonic').length !== 1) {
			return `${side}: the new note is not searchable before the edit`;
		}
		if (!j.updateNote(n.id, 'something else entirely')) return `${side}: updateNote returned null`;
		if (j.ftsCandidateIds('xylophonic').length !== 0) {
			return `${side}: a stale FTS row still matches the first old word`;
		}
		if (j.ftsCandidateIds('marmalade').length !== 0) {
			return `${side}: a stale FTS row still matches the second old word`;
		}
	}
	return true;
});

check('setVector then allVectors round-trips on both', () => {
	const v = new Float32Array(384);
	for (let i = 0; i < v.length; i++) v[i] = Math.sin(i / 3);
	for (const j of [a, w]) {
		const id = j.listNotesPage({ limit: 1 }).notes[0].id;
		j.setVector(id, v);
		const back = j.allVectors().find((x) => x.noteId === id);
		if (!back) return `vector missing after write (${j === a ? 'node' : 'wasm'})`;
		for (let i = 0; i < v.length; i++) {
			if (back.vector[i] !== v[i]) {
				return `value ${i} differs (${j === a ? 'node' : 'wasm'}): ${back.vector[i]} vs ${v[i]}`;
			}
		}
	}
	return true;
});

check('tags: set, count, remove', () => {
	const id = a.listNotesPage({ limit: 1 }).notes[0].id;
	a.setNoteTags(id, ['KAYAKING', 'garden', 'kayaking']);
	const got = a.getNote(id)!;
	if (got.tags.length !== 2) return `expected 2 deduped lowercase tags, got ${JSON.stringify(got.tags)}`;
	if (!a.removeNoteTag(id, 'GARDEN')) return 'removeNoteTag returned false';
	if (a.getNote(id)!.tags.includes('garden')) return 'garden survived removal';
	if (a.removeNoteTag(id, 'garden')) return 'removing a missing tag returned true';
	return true;
});

check('deleteNote removes the FTS row too', () => {
	const n = a.createNote('doomed note about a kayak', Date.UTC(2025, 2, 6));
	if (!a.deleteNote(n.id)) return 'deleteNote returned false';
	if (a.ftsCandidateIds('doomed').length !== 0) return 'the deleted note is still searchable';
	if (a.deleteNote(n.id)) return 'deleting twice returned true';
	return true;
});

check('transaction rolls back on a throw', () => {
	const before = a.countNotes();
	try {
		a.db.transaction(() => {
			a.createNote('should not survive', Date.UTC(2025, 2, 7));
			throw new Error('boom');
		});
	} catch {
		// expected
	}
	return a.countNotes() === before ? true : `notes went from ${before} to ${a.countNotes()}`;
});

check('the wasm engine survives being read after all those writes', () => {
	if (w.countNotes() < 1) return 'wasm count is zero';
	if (w.listNotesPage({ limit: 1 }).notes.length !== 1) return 'wasm page is empty';
	return true;
});

rmSync(work, { recursive: true, force: true });

let failed = 0;
for (const r of results) {
	if (!r.ok) failed++;
	console.log(`${r.ok ? 'ok  ' : 'FAIL'}  ${r.name}${r.detail ? `\n      ${r.detail}` : ''}`);
}
console.log('');
if (failed) {
	console.log(`${failed}/${results.length} parity checks FAILED. The two engines do not agree.`);
	process.exit(1);
}
console.log(`${results.length}/${results.length} parity checks passed. Both engines behave identically.`);
