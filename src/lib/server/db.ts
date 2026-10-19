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

// Databases created before the featured flag need the column added. PRAGMA
// reads the real schema, so this runs exactly once per database.
const noteCols = db.prepare('PRAGMA table_info(notes)').all() as { name: string }[];
if (!noteCols.some((c) => c.name === 'featured')) {
	db.exec('ALTER TABLE notes ADD COLUMN featured INTEGER NOT NULL DEFAULT 0');
}
if (!noteCols.some((c) => c.name === 'video')) {
	db.exec("ALTER TABLE notes ADD COLUMN video TEXT NOT NULL DEFAULT ''");
}
// The notes in-progress experiment shipped and was reverted: tasks own that
// concept now. Drop the column where it exists; fresh tables never had it.
if (noteCols.some((c) => c.name === 'in_progress')) {
	db.exec('ALTER TABLE notes DROP COLUMN in_progress');
}

// To-Do groups and items created before position backfill in creation
// order, so visible lists do not reshuffle under the user.
const groupCols = db.prepare('PRAGMA table_info(todo_groups)').all() as { name: string }[];
if (!groupCols.some((c) => c.name === 'position')) {
	db.exec('ALTER TABLE todo_groups ADD COLUMN position INTEGER NOT NULL DEFAULT 0');
	const ids = db
		.prepare('SELECT id FROM todo_groups ORDER BY created_at ASC, id ASC')
		.all() as { id: string }[];
	const upd = db.prepare('UPDATE todo_groups SET position = ? WHERE id = ?');
	db.transaction(() => {
		ids.forEach((r, i) => upd.run(i, r.id));
	});
}
const itemCols = db.prepare('PRAGMA table_info(todo_items)').all() as { name: string }[];
if (!itemCols.some((c) => c.name === 'done_at')) {
	db.exec('ALTER TABLE todo_items ADD COLUMN done_at INTEGER NOT NULL DEFAULT 0');
}
if (!itemCols.some((c) => c.name === 'position')) {
	db.exec('ALTER TABLE todo_items ADD COLUMN position INTEGER NOT NULL DEFAULT 0');
	const ids = db
		.prepare('SELECT id FROM todo_items ORDER BY created_at ASC, id ASC')
		.all() as { id: string }[];
	const upd = db.prepare('UPDATE todo_items SET position = ? WHERE id = ?');
	db.transaction(() => {
		ids.forEach((r, i) => upd.run(i, r.id));
	});
}
if (!itemCols.some((c) => c.name === 'in_progress')) {
	db.exec('ALTER TABLE todo_items ADD COLUMN in_progress INTEGER NOT NULL DEFAULT 0');
}
if (!itemCols.some((c) => c.name === 'subgroup')) {
	db.exec("ALTER TABLE todo_items ADD COLUMN subgroup TEXT NOT NULL DEFAULT ''");
}
// Older data could mark an item done without clearing its in-progress flag.
db.exec('UPDATE todo_items SET in_progress = 0 WHERE done = 1 AND in_progress = 1');

const principleCols = db.prepare('PRAGMA table_info(principles)').all() as { name: string }[];
if (!principleCols.some((c) => c.name === 'video')) {
	db.exec("ALTER TABLE principles ADD COLUMN video TEXT NOT NULL DEFAULT ''");
}

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
	setNoteFeatured,
	setNoteVideo,
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
	deleteAsk,
	listTodoGroups,
	createTodoGroup,
	renameTodoGroup,
	deleteTodoGroup,
	setTodoGroupOrder,
	listTodoItems,
	getTodoItem,
	createTodoItem,
	updateTodoItem,
	deleteTodoItem,
	setTodoItemTags,
	listTodoItemsByTag,
	setTodoItemOrder,
	listInProgressItems,
	listTaskComments,
	createTaskComment,
	deleteTaskComment,
	listNoteComments,
	createNoteComment,
	deleteNoteComment,
	listPrinciples,
	createPrinciple,
	updatePrinciple,
	deletePrinciple,
	setPrincipleOrder,
	setPrincipleVideo,
	listPrinciplesByTag,
	setPrincipleTags,
	listPrincipleComments,
	createPrincipleComment,
	deletePrincipleComment,
	listTagColors,
	setTagColor
} = journal;

export type { Note, NoteRow, NoteCursor, NotePage, AskRow, Ask, TodoGroup, TodoItem, TodoProgressItem, TaskComment, NoteComment, Principle } from '$lib/platform/journal';
