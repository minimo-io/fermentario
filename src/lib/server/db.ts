import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createJournal } from '$lib/platform/journal';
import { createNodeDb } from '$lib/server/node-db';

/**
 * The journal on Node. Every query lives in `$lib/platform/journal`; this file
 * only opens the database, applies the pragmas and the schema, and re-exports
 * the same function names the 11 API routes already import.
 */

const dataDir = resolve(process.env['FERMENTARIO_DATA_DIR'] ?? './data');
mkdirSync(dataDir, { recursive: true });

export const db = createNodeDb(resolve(dataDir, 'fermentario.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const journal = createJournal(db);
db.exec(journal.Schema);

export const {
	createNote,
	deleteNote,
	updateNote,
	getNote,
	listNotesPage,
	countNotesByTag,
	notesMissingVectors,
	notesBetween,
	setNoteTags,
	removeNoteTag,
	notesMissingTags,
	setVector,
	allVectors,
	ftsCandidateIds,
	countNotes,
	latestTimestamp,
	getWeeklyRecap,
	saveWeeklyRecap,
	insertAsk,
	listAsks,
	deleteAsk
} = journal;

export type { Note, NoteRow, NoteCursor, NotePage, AskRow, Ask } from '$lib/platform/journal';
