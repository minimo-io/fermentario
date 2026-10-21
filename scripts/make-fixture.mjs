/**
 * Build a frozen journal fixture for the regression tests.
 *
 * The fixture is synthetic on purpose: the real `data/fermentario.db` holds
 * personal journal text, and a golden file committed next to it would carry
 * that text into every diff. It is also unstable — every new note the user
 * writes would change the golden and hide a real regression.
 *
 * It is built with better-sqlite3 because that build has FTS5. The system
 * `sqlite3` CLI on this machine does not (`no such module: fts5`).
 *
 * Everything is deterministic: fixed ids, fixed timestamps, fixed vectors.
 * The cursor edge case is included on purpose — two notes share a
 * `created_at`, so any pagination change shows up as a reordering.
 *
 *   node scripts/make-fixture.mjs [output-path]
 */
import Database from 'better-sqlite3';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const out = resolve(process.argv[2] ?? 'tests/fixtures/journal.db');
const DIMS = 384;

const DAY = 24 * 60 * 60 * 1000;
/** Fixed base so the heatmap day keys never move. 2025-03-04T12:00:00Z. */
const BASE = Date.UTC(2025, 2, 4, 12, 0, 0);

const notes = [
	// Two notes share BASE: the cursor is (created_at, id), so a change from
	// created_at-only ordering swaps them and the golden catches it.
	{ id: '11111111-1111-4111-8111-111111111101', at: BASE, text: 'Went kayaking on the river at dawn.', tags: ['garden'] },
	{ id: '11111111-1111-4111-8111-111111111102', at: BASE, text: 'Fixed the broken chair in the hallway.', tags: [] },
	{ id: '11111111-1111-4111-8111-111111111103', at: BASE - 2 * DAY, text: 'Long standup about the migration deadline.', tags: ['work'] },
	{ id: '11111111-1111-4111-8111-111111111104', at: BASE - 9 * DAY, text: 'Finally finished the kayak paddle repair.', tags: ['garden', 'work'] },
	{ id: '11111111-1111-4111-8111-111111111105', at: Date.UTC(2024, 10, 3, 9, 30, 0), text: 'Old note from last year about kayaking trips.', tags: ['garden'] }
];

/** Deterministic pseudo-embedding. Real values come from the embedder; the
 *  tests only care that the bytes survive a round trip unchanged. */
function vector(seed) {
	const v = new Float32Array(DIMS);
	for (let i = 0; i < DIMS; i++) v[i] = Math.round(Math.sin((i + seed) / 7) * 1000) / 1000;
	return v;
}

mkdirSync(dirname(out), { recursive: true });
for (const suffix of ['', '-wal', '-shm', '-journal']) rmSync(`${out}${suffix}`, { force: true });

const db = new Database(out);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// An old, deliberately minimal schema. The first-boot import and migration
// baseline add the current columns and the missing tables. A missing table is a
// test failure, not something to paper over: this fixture must keep exercising
// the migration path.
db.exec(`
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
	CREATE TABLE weekly_recaps (
		week_key   TEXT PRIMARY KEY,
		content    TEXT NOT NULL,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	);
	CREATE TABLE ask_history (
		id         TEXT PRIMARY KEY,
		question   TEXT NOT NULL,
		answer     TEXT NOT NULL,
		sources    TEXT NOT NULL DEFAULT '[]',
		created_at INTEGER NOT NULL
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
`);

const insertNote = db.prepare(
	'INSERT INTO notes (id, content, created_at, updated_at) VALUES (?, ?, ?, ?)'
);
const insertFts = db.prepare('INSERT INTO notes_fts (content, note_id) VALUES (?, ?)');
const insertTag = db.prepare('INSERT INTO note_tags (note_id, tag) VALUES (?, ?)');
const insertVector = db.prepare('INSERT INTO note_vectors (note_id, vector) VALUES (?, ?)');

notes.forEach((n, i) => {
	insertNote.run(n.id, n.text, n.at, n.at);
	insertFts.run(n.text, n.id);
	for (const t of n.tags) insertTag.run(n.id, t);
	const buf = Buffer.from(vector(i).buffer);
	insertVector.run(n.id, buf);
});

const weekKey = String(Math.floor(BASE / (7 * 24 * 60 * 60 * 1000)));
db.prepare('INSERT INTO weekly_recaps (week_key, content, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
	weekKey,
	'The week was about kayaking and one broken chair.',
	BASE,
	BASE
);

db.prepare('INSERT INTO ask_history (id, question, answer, sources, created_at) VALUES (?, ?, ?, ?, ?)').run(
	'22222222-2222-4222-8222-222222222201',
	'what did I do at the weekend?',
	'You went kayaking on the river at dawn.',
	JSON.stringify([{ id: notes[0].id, at: notes[0].at, content: notes[0].text }]),
	BASE
);

// A single file with no WAL side-car, so the fixture is stable in git and the
// tests never depend on checkpoint behaviour.
db.pragma('wal_checkpoint(TRUNCATE)');
db.close();
rmSync(`${out}-wal`, { force: true });
rmSync(`${out}-shm`, { force: true });

console.log(`fixture written: ${out} (${notes.length} notes, ${BASE} base time)`);
