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
 * Everything is deterministic: fixed ids and fixed timestamps.
 * The cursor edge case is included on purpose — two notes share a
 * `created_at`, so any pagination change shows up as a reordering.
 *
 *   node scripts/make-fixture.mjs [output-path]
 */
import Database from 'better-sqlite3';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const out = resolve(process.argv[2] ?? 'tests/fixtures/journal.db');
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

notes.forEach((n) => {
	insertNote.run(n.id, n.text, n.at, n.at);
	insertFts.run(n.text, n.id);
	for (const t of n.tags) insertTag.run(n.id, t);
});

// A single file with no WAL side-car, so the fixture is stable in git and the
// tests never depend on checkpoint behaviour.
db.pragma('wal_checkpoint(TRUNCATE)');
db.close();
rmSync(`${out}-wal`, { force: true });
rmSync(`${out}-shm`, { force: true });

console.log(`fixture written: ${out} (${notes.length} notes, ${BASE} base time)`);
