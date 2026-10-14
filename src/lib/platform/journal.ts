import type { SqlDb, SqlValue } from './sqlite';

/**
 * Every query the app makes, written once against the `SqlDb` interface.
 *
 * This is the code that used to live in `src/lib/server/db.ts`, moved here
 * unchanged so that better-sqlite3 in Node and SQLite-in-WebAssembly in the
 * WebView run exactly the same SQL. `src/lib/server/db.ts` still exports the
 * same function names, so the 11 API routes are untouched.
 */

export const SCHEMA = `
	CREATE TABLE IF NOT EXISTS notes (
		id         TEXT PRIMARY KEY,
		content    TEXT NOT NULL,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL,
		featured   INTEGER NOT NULL DEFAULT 0,
		video      TEXT NOT NULL DEFAULT ''
	);

	CREATE TABLE IF NOT EXISTS note_vectors (
		note_id TEXT PRIMARY KEY REFERENCES notes(id) ON DELETE CASCADE,
		vector  BLOB NOT NULL
	);

	CREATE TABLE IF NOT EXISTS weekly_recaps (
		week_key   TEXT PRIMARY KEY,
		content    TEXT NOT NULL,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS ask_history (
		id         TEXT PRIMARY KEY,
		question   TEXT NOT NULL,
		answer     TEXT NOT NULL,
		sources    TEXT NOT NULL DEFAULT '[]',
		created_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS note_tags (
		note_id TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
		tag     TEXT NOT NULL,
		PRIMARY KEY (note_id, tag)
	);

	CREATE TABLE IF NOT EXISTS todo_groups (
		id         TEXT PRIMARY KEY,
		name       TEXT NOT NULL,
		created_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS todo_items (
		id         TEXT PRIMARY KEY,
		group_id   TEXT NOT NULL REFERENCES todo_groups(id) ON DELETE CASCADE,
		content    TEXT NOT NULL,
		done       INTEGER NOT NULL DEFAULT 0,
		done_at    INTEGER NOT NULL DEFAULT 0,
		in_progress INTEGER NOT NULL DEFAULT 0,
		position   INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL,
		updated_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS todo_item_tags (
		item_id TEXT NOT NULL REFERENCES todo_items(id) ON DELETE CASCADE,
		tag     TEXT NOT NULL,
		PRIMARY KEY (item_id, tag)
	);

	CREATE TABLE IF NOT EXISTS principles (
		id         TEXT PRIMARY KEY,
		content    TEXT NOT NULL,
		position   INTEGER NOT NULL,
		created_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS tag_colors (
		tag   TEXT PRIMARY KEY,
		color TEXT NOT NULL
	);

	CREATE TABLE IF NOT EXISTS task_comments (
		id         TEXT PRIMARY KEY,
		item_id    TEXT NOT NULL REFERENCES todo_items(id) ON DELETE CASCADE,
		content    TEXT NOT NULL,
		created_at INTEGER NOT NULL
	);

	CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
		content,
		note_id UNINDEXED,
		tokenize = 'porter unicode61'
	);
`;

export interface Note {
	id: string;
	content: string;
	created_at: number;
	updated_at: number;
	featured: boolean;
	video: string;
	tags: string[];
}

export interface NoteRow {
	id: string;
	content: string;
	created_at: number;
	updated_at: number;
	featured: number;
	video: string;
}

export interface NoteCursor {
	created_at: number;
	id: string;
}

export interface NotePage {
	notes: Note[];
	hasMore: boolean;
	nextCursor: NoteCursor | null;
}

export interface AskRow {
	id: string;
	question: string;
	answer: string;
	sources: string;
	created_at: number;
}

export type Ask = ReturnType<typeof rowToAsk>;

export interface TodoGroup {
	id: string;
	name: string;
	created_at: number;
}

export interface TodoItem {
	id: string;
	group_id: string;
	content: string;
	done: boolean;
	done_at: number;
	inProgress: boolean;
	position: number;
	created_at: number;
	updated_at: number;
	commentCount: number;
	tags: string[];
}

export interface Principle {
	id: string;
	content: string;
	position: number;
	created_at: number;
}

export interface TaskComment {
	id: string;
	item_id: string;
	content: string;
	created_at: number;
}

export interface TodoProgressItem extends TodoItem {
	groupName: string;
}

const rowToNote = (r: NoteRow, tags: string[] = []): Note => ({
	id: r.id,
	content: r.content,
	created_at: r.created_at,
	updated_at: r.updated_at,
	featured: r.featured === 1,
	video: r.video ?? '',
	tags
});

const rowToAsk = (r: AskRow) => ({
	id: r.id,
	question: r.question,
	answer: r.answer,
	sources: JSON.parse(r.sources || '[]'),
	created_at: r.created_at
});

/** better-sqlite3 hands back `Buffer`, sqlite-wasm hands back `Uint8Array`.
 *  This is the one place that difference is allowed to exist. */
function toBytes(v: unknown): Uint8Array {
	if (v instanceof Uint8Array) return v;
	if (ArrayBuffer.isView(v)) return new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
	if (v instanceof ArrayBuffer) return new Uint8Array(v);
	return new Uint8Array(0);
}

export function createJournal(db: SqlDb) {
	function tagsByNote(rows: { id: string }[]): Map<string, string[]> {
		const map = new Map<string, string[]>();
		if (rows.length === 0) return map;
		const ids = rows.map((r) => r.id);
		const placeholders = ids.map(() => '?').join(',');
		const tagRows = db
			.prepare(`SELECT note_id, tag FROM note_tags WHERE note_id IN (${placeholders}) ORDER BY tag`)
			.all(...ids) as unknown as { note_id: string; tag: string }[];
		for (const t of tagRows) {
			if (!map.has(t.note_id)) map.set(t.note_id, []);
			map.get(t.note_id)!.push(t.tag);
		}
		return map;
	}

	function withTags(rows: NoteRow[]): Note[] {
		const tags = tagsByNote(rows);
		return rows.map((r) => rowToNote(r, tags.get(r.id) ?? []));
	}

	function createNote(content: string, createdAt: number): Note {
		const id = crypto.randomUUID();
		const now = createdAt;
		db.prepare('INSERT INTO notes (id, content, created_at, updated_at) VALUES (?, ?, ?, ?)').run(
			id,
			content,
			now,
			now
		);
		db.prepare('INSERT INTO notes_fts (content, note_id) VALUES (?, ?)').run(content, id);
		return { id, content, created_at: now, updated_at: now, featured: false, video: '', tags: [] };
	}

	function deleteNote(id: string): boolean {
		const done = db.prepare('DELETE FROM notes WHERE id = ?').run(id).changes > 0;
		if (done) db.prepare('DELETE FROM notes_fts WHERE note_id = ?').run(id);
		return done;
	}

	/** Replace a note's content. `created_at` is immutable; `updated_at` always
	 *  moves past it so the "edited" marker can rely on a strict comparison.
	 *  Returns null when the note does not exist. */
	function updateNote(id: string, content: string): Note | null {
		const existing = db.prepare('SELECT created_at FROM notes WHERE id = ?').get(id) as
			| { created_at: number }
			| undefined;
		if (!existing) return null;
		const now = Math.max(Date.now(), existing.created_at + 1);
		db.prepare('UPDATE notes SET content = ?, updated_at = ? WHERE id = ?').run(content, now, id);
		db.prepare('DELETE FROM notes_fts WHERE note_id = ?').run(id);
		db.prepare('INSERT INTO notes_fts (content, note_id) VALUES (?, ?)').run(content, id);
		return getNote(id);
	}

	function getNote(id: string): Note | null {
		const r = db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as unknown as NoteRow | undefined;
		return r ? withTags([r])[0] : null;
	}

	/** Pin or unpin a note. Touches only the flag: text, FTS row, vector
	 *  and tags are left alone. Returns null when the note does not exist. */
	function setNoteFeatured(id: string, featured: boolean): Note | null {
		const done = db.prepare('UPDATE notes SET featured = ? WHERE id = ?').run(featured ? 1 : 0, id).changes > 0;
		if (!done) return null;
		return getNote(id);
	}

	/** Set or clear the YouTube video id. Empty clears. Like featuring, this
	 *  touches only its column. Returns null when the note does not exist. */
	function setNoteVideo(id: string, video: string): Note | null {
		const done = db.prepare('UPDATE notes SET video = ? WHERE id = ?').run(video, id).changes > 0;
		if (!done) return null;
		return getNote(id);
	}

	/** One page of notes, newest first, with a stable cursor.
	 *
	 *  The cursor is (created_at, id), not created_at alone: notes saved in the
	 *  same millisecond would otherwise be skipped or returned twice. The `tag`
	 *  variant joins note_tags, so every page of a tag view is filtered on the
	 *  server and the client only ever appends matching notes. */
	function listNotesPage(
		opts: { limit?: number; before?: number | null; beforeId?: string | null; tag?: string | null; featured?: 'only' | 'exclude' } = {}
	): NotePage {
		const limit = Math.max(1, Math.min(100, Math.trunc(opts.limit ?? 50)));
		const tag = opts.tag?.trim().toLowerCase() || null;
		const featuredSql = opts.featured === 'only' ? ' AND n.featured = 1' : opts.featured === 'exclude' ? ' AND n.featured = 0' : '';
		const useCursor =
			typeof opts.before === 'number' && Number.isFinite(opts.before) && !!opts.beforeId;
		const cursorSql = useCursor
			? ' AND (n.created_at < ? OR (n.created_at = ? AND n.id < ?))'
			: '';
		const params: SqlValue[] = [];
		let sql: string;
		if (tag) {
			sql = `SELECT n.* FROM notes n JOIN note_tags t ON t.note_id = n.id WHERE t.tag = ?${featuredSql}${cursorSql}
				ORDER BY n.created_at DESC, n.id DESC LIMIT ?`;
			params.push(tag);
		} else {
			sql = `SELECT n.* FROM notes n WHERE 1 = 1${featuredSql}${cursorSql}
				ORDER BY n.created_at DESC, n.id DESC LIMIT ?`;
		}
		if (useCursor) params.push(opts.before as number, opts.before as number, opts.beforeId as string);
		params.push(limit + 1);

		const rows = db.prepare(sql).all(...params) as unknown as NoteRow[];
		const hasMore = rows.length > limit;
		const page = hasMore ? rows.slice(0, limit) : rows;
		const last = page[page.length - 1];
		return {
			notes: withTags(page),
			hasMore,
			nextCursor: last ? { created_at: last.created_at, id: last.id } : null
		};
	}

	function countNotesByTag(tag: string): number {
		return (db
			.prepare('SELECT COUNT(*) AS c FROM note_tags WHERE tag = ?')
			.get(tag.trim().toLowerCase()) as { c: number }).c;
	}

	/** Notes without an embedding, newest first. The indexing pass uses this
	 *  instead of loading the whole table and every vector. */
	function notesMissingVectors(limit = 25): string[] {
		const rows = db
			.prepare(
				`SELECT n.id FROM notes n
				 LEFT JOIN note_vectors v ON v.note_id = n.id
				 WHERE v.note_id IS NULL
				 ORDER BY n.created_at DESC LIMIT ?`
			)
			.all(limit) as unknown as { id: string }[];
		return rows.map((r) => r.id);
	}

	function notesBetween(from: number, to: number): Note[] {
		const rows = db
			.prepare('SELECT * FROM notes WHERE created_at >= ? AND created_at <= ? ORDER BY created_at ASC')
			.all(from, to) as unknown as NoteRow[];
		return withTags(rows);
	}

	/** Replace a note's tags. Passing an empty array clears them. */
	function setNoteTags(noteId: string, tags: string[]): void {
		const clean = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
		db.prepare('DELETE FROM note_tags WHERE note_id = ?').run(noteId);
		if (clean.length === 0) return;
		const ins = db.prepare('INSERT INTO note_tags (note_id, tag) VALUES (?, ?)');
		db.transaction(() => {
			for (const t of clean) ins.run(noteId, t);
		});
	}

	/** Remove one tag from one note. Returns false when the link did not exist.
	 *  The tag is normalised the same way setNoteTags stores it. */
	function removeNoteTag(noteId: string, tag: string): boolean {
		const clean = tag.trim().toLowerCase();
		if (!clean) return false;
		return (
			db.prepare('DELETE FROM note_tags WHERE note_id = ? AND tag = ?').run(noteId, clean).changes > 0
		);
	}

	// --- To-Do groups and items -------------------------------------------
	// Tags on items use the exact same normalisation as note tags
	// (trim + lowercase, max 12), so tags stay one concept across sections.

	function listTodoGroups(): TodoGroup[] {
		return db
			.prepare('SELECT * FROM todo_groups ORDER BY created_at ASC, id ASC')
			.all() as unknown as TodoGroup[];
	}

	function createTodoGroup(name: string): TodoGroup | null {
		const clean = name.trim();
		if (!clean) return null;
		const now = Date.now();
		const id = crypto.randomUUID();
		db.prepare('INSERT INTO todo_groups (id, name, created_at) VALUES (?, ?, ?)').run(id, clean, now);
		return { id, name: clean, created_at: now };
	}

	/** Rename a group. Items follow because they reference the group id, which
	 *  never changes. Returns null when the group does not exist. */
	function renameTodoGroup(id: string, name: string): TodoGroup | null {
		const clean = name.trim();
		if (!clean) return null;
		const done = db.prepare('UPDATE todo_groups SET name = ? WHERE id = ?').run(clean, id).changes > 0;
		if (!done) return null;
		return db.prepare('SELECT * FROM todo_groups WHERE id = ?').get(id) as unknown as TodoGroup;
	}

	function deleteTodoGroup(id: string): boolean {
		return db.prepare('DELETE FROM todo_groups WHERE id = ?').run(id).changes > 0;
	}

	function tagsByItem(rows: { id: string }[]): Map<string, string[]> {
		const map = new Map<string, string[]>();
		if (rows.length === 0) return map;
		const ids = rows.map((r) => r.id);
		const placeholders = ids.map(() => '?').join(',');
		const tagRows = db
			.prepare(`SELECT item_id, tag FROM todo_item_tags WHERE item_id IN (${placeholders}) ORDER BY tag`)
			.all(...ids) as unknown as { item_id: string; tag: string }[];
		for (const t of tagRows) {
			if (!map.has(t.item_id)) map.set(t.item_id, []);
			map.get(t.item_id)!.push(t.tag);
		}
		return map;
	}

	interface TodoItemRow {
		id: string;
		group_id: string;
		content: string;
		done: number;
		done_at: number;
		in_progress: number;
		position: number;
		created_at: number;
		updated_at: number;
		comment_count: number;
	}

	const rowToTodoItem = (r: TodoItemRow, tags: string[] = []): TodoItem => ({
		id: r.id,
		group_id: r.group_id,
		content: r.content,
		done: r.done === 1,
		done_at: r.done_at ?? 0,
		inProgress: r.in_progress === 1,
		position: r.position ?? 0,
		created_at: r.created_at,
		updated_at: r.updated_at,
		commentCount: r.comment_count ?? 0,
		tags
	});

	function listTodoItems(groupId: string): TodoItem[] {
		const rows = db
			.prepare(
				`SELECT i.*, (SELECT COUNT(*) FROM task_comments c WHERE c.item_id = i.id) AS comment_count
				 FROM todo_items i WHERE i.group_id = ? ORDER BY i.in_progress DESC, i.position ASC, i.created_at ASC, i.id ASC`
			)
			.all(groupId) as unknown as TodoItemRow[];
		const tags = tagsByItem(rows);
		return rows.map((r) => rowToTodoItem(r, tags.get(r.id) ?? []));
	}

	function getTodoItem(id: string): TodoItem | null {
		const r = db.prepare('SELECT * FROM todo_items WHERE id = ?').get(id) as unknown as TodoItemRow | undefined;
		if (!r) return null;
		return rowToTodoItem(r, tagsByItem([r]).get(r.id) ?? []);
	}

	function createTodoItem(groupId: string, content: string, createdAt: number): TodoItem | null {
		const group = db.prepare('SELECT id FROM todo_groups WHERE id = ?').get(groupId) as unknown as { id: string } | undefined;
		if (!group) return null;
		const clean = content.trim();
		if (!clean) return null;
		const max = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM todo_items WHERE group_id = ?').get(groupId) as { m: number };
		const id = crypto.randomUUID();
		db.prepare(
			'INSERT INTO todo_items (id, group_id, content, done, done_at, in_progress, position, created_at, updated_at) VALUES (?, ?, ?, 0, 0, 0, ?, ?, ?)'
		).run(id, groupId, clean, max.m + 1, createdAt, createdAt);
		return { id, group_id: groupId, content: clean, done: false, done_at: 0, inProgress: false, position: max.m + 1, created_at: createdAt, updated_at: createdAt, commentCount: 0, tags: [] };
	}

	/** Edit text and/or checked state. `updated_at` always moves past
	 *  `created_at`. Checking stamps `done_at`; unchecking clears it.
	 *  Returns null when the item does not exist. */
	function updateTodoItem(id: string, patch: { content?: string; done?: boolean; inProgress?: boolean }): TodoItem | null {
		const existing = db.prepare('SELECT * FROM todo_items WHERE id = ?').get(id) as unknown as TodoItemRow | undefined;
		if (!existing) return null;
		const content = patch.content !== undefined ? patch.content.trim() : existing.content;
		if (!content) return null;
		const done = patch.done !== undefined ? (patch.done ? 1 : 0) : existing.done;
		const now = Math.max(Date.now(), existing.created_at + 1);
		const doneAt = patch.done !== undefined ? (patch.done ? now : 0) : (existing.done_at ?? 0);
		const inProgress = patch.inProgress !== undefined ? (patch.inProgress ? 1 : 0) : (existing.in_progress ?? 0);
		db.prepare('UPDATE todo_items SET content = ?, done = ?, done_at = ?, in_progress = ?, updated_at = ? WHERE id = ?').run(content, done, doneAt, inProgress, now, id);
		return getTodoItem(id);
	}

	function deleteTodoItem(id: string): boolean {
		return db.prepare('DELETE FROM todo_items WHERE id = ?').run(id).changes > 0;
	}

	/** Items carrying a tag, newest first. Powers the To-Do group on tag pages. */
	function listTodoItemsByTag(tag: string): TodoItem[] {
		const clean = tag.trim().toLowerCase();
		if (!clean) return [];
		const rows = db
			.prepare(
				`SELECT i.*, (SELECT COUNT(*) FROM task_comments c WHERE c.item_id = i.id) AS comment_count
				 FROM todo_items i JOIN todo_item_tags t ON t.item_id = i.id
				 WHERE t.tag = ? ORDER BY i.created_at DESC, i.id DESC`
			)
			.all(clean) as unknown as TodoItemRow[];
		const tags = tagsByItem(rows);
		return rows.map((r) => rowToTodoItem(r, tags.get(r.id) ?? []));
	}

	/** Every in-progress item across groups, with its group name attached. */
	function listInProgressItems(): TodoProgressItem[] {
		const rows = db
			.prepare(
				`SELECT i.*, g.name AS group_name,
					(SELECT COUNT(*) FROM task_comments c WHERE c.item_id = i.id) AS comment_count
				 FROM todo_items i JOIN todo_groups g ON g.id = i.group_id
				 WHERE i.in_progress = 1 ORDER BY i.updated_at DESC, i.id DESC`
			)
			.all() as unknown as (TodoItemRow & { group_name: string })[];
		const tags = tagsByItem(rows);
		return rows.map((r) => ({ ...rowToTodoItem(r, tags.get(r.id) ?? []), groupName: r.group_name }));
	}

	/** Persist a full item order inside one group. Unknown ids are ignored. */
	function setTodoItemOrder(groupId: string, ids: string[]): void {
		const upd = db.prepare('UPDATE todo_items SET position = ? WHERE id = ? AND group_id = ?');
		db.transaction(() => {
			ids.forEach((id, i) => upd.run(i, id, groupId));
		});
	}

	// --- Task comments -----------------------------------------------------
	// Append-only history of a task's evolution. Comments are never edited;
	// deleting one needs a confirm on the client.

	function listTaskComments(itemId: string): TaskComment[] {
		return db
			.prepare('SELECT * FROM task_comments WHERE item_id = ? ORDER BY created_at ASC, id ASC')
			.all(itemId) as unknown as TaskComment[];
	}

	function createTaskComment(itemId: string, content: string): TaskComment | null {
		const group = db.prepare('SELECT id FROM todo_items WHERE id = ?').get(itemId) as unknown as { id: string } | undefined;
		if (!group) return null;
		const clean = content.trim();
		if (!clean) return null;
		const id = crypto.randomUUID();
		const now = Date.now();
		db.prepare('INSERT INTO task_comments (id, item_id, content, created_at) VALUES (?, ?, ?, ?)').run(id, itemId, clean, now);
		return { id, item_id: itemId, content: clean, created_at: now };
	}

	function deleteTaskComment(itemId: string, id: string): boolean {
		return db.prepare('DELETE FROM task_comments WHERE id = ? AND item_id = ?').run(id, itemId).changes > 0;
	}

	/** Replace an item's tags. Passing an empty array clears them. */
	function setTodoItemTags(itemId: string, tags: string[]): void {
		const clean = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
		db.prepare('DELETE FROM todo_item_tags WHERE item_id = ?').run(itemId);
		if (clean.length === 0) return;
		const ins = db.prepare('INSERT INTO todo_item_tags (item_id, tag) VALUES (?, ?)');
		db.transaction(() => {
			for (const t of clean) ins.run(itemId, t);
		});
	}

	// --- Principles ------------------------------------------------------
	// Numbering is positional: `position` stores the order, the display
	// derives 1..N from it. Reorder writes the whole order in one
	// transaction so numbers can never gap.

	function listPrinciples(): Principle[] {
		return db
			.prepare('SELECT * FROM principles ORDER BY position ASC, created_at ASC, id ASC')
			.all() as unknown as Principle[];
	}

	function createPrinciple(content: string): Principle | null {
		const clean = content.trim();
		if (!clean) return null;
		const max = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM principles').get() as { m: number };
		const id = crypto.randomUUID();
		const now = Date.now();
		db.prepare('INSERT INTO principles (id, content, position, created_at) VALUES (?, ?, ?, ?)').run(
			id,
			clean,
			max.m + 1,
			now
		);
		return { id, content: clean, position: max.m + 1, created_at: now };
	}

	function updatePrinciple(id: string, content: string): Principle | null {
		const clean = content.trim();
		if (!clean) return null;
		const done = db.prepare('UPDATE principles SET content = ? WHERE id = ?').run(clean, id).changes > 0;
		if (!done) return null;
		return db.prepare('SELECT * FROM principles WHERE id = ?').get(id) as unknown as Principle;
	}

	function deletePrinciple(id: string): boolean {
		return db.prepare('DELETE FROM principles WHERE id = ?').run(id).changes > 0;
	}

	/** Persist a full order. Unknown ids are ignored; missing rows keep
	 *  their relative order after the listed ones. */
	function setPrincipleOrder(ids: string[]): void {
		const upd = db.prepare('UPDATE principles SET position = ? WHERE id = ?');
		db.transaction(() => {
			ids.forEach((id, i) => upd.run(i, id));
		});
	}

	// --- Tag colors -------------------------------------------------------
	// One row per normalized tag. The registry outlives any single note or
	// item, so a color choice survives deletes. Colors are palette keys, not
	// free CSS, so a stored value can never inject a style.

	function listTagColors(): Record<string, string> {
		const rows = db.prepare('SELECT tag, color FROM tag_colors').all() as unknown as {
			tag: string;
			color: string;
		}[];
		const out: Record<string, string> = {};
		for (const r of rows) out[r.tag] = r.color;
		return out;
	}

	function setTagColor(tag: string, color: string): boolean {
		const clean = tag.trim().toLowerCase();
		if (!clean) return false;
		db.prepare(
			'INSERT INTO tag_colors (tag, color) VALUES (?, ?) ON CONFLICT(tag) DO UPDATE SET color = excluded.color'
		).run(clean, color);
		return true;
	}

	function notesMissingTags(limit = 50): string[] {
		const rows = db
			.prepare(
				`SELECT n.id FROM notes n
				 LEFT JOIN note_tags nt ON nt.note_id = n.id
				 WHERE nt.note_id IS NULL
				 ORDER BY n.created_at DESC LIMIT ?`
			)
			.all(limit) as unknown as { id: string }[];
		return rows.map((r) => r.id);
	}

	function setVector(noteId: string, vector: Float32Array): void {
		const buf = new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength);
		db.prepare(
			`INSERT INTO note_vectors (note_id, vector) VALUES (?, ?)
			 ON CONFLICT(note_id) DO UPDATE SET vector = excluded.vector`
		).run(noteId, buf);
	}

	function allVectors(): { noteId: string; vector: Float32Array }[] {
		const rows = db
			.prepare('SELECT note_id, vector FROM note_vectors')
			.all() as unknown as { note_id: string; vector: unknown }[];
		return rows.map((r) => {
			const bytes = toBytes(r.vector);
			// Copy into a fresh buffer: the engine's memory is not guaranteed to
			// survive the next statement, and the view may not be 4-byte aligned.
			const copy = bytes.slice();
			return { noteId: r.note_id, vector: new Float32Array(copy.buffer, copy.byteOffset, copy.byteLength / 4) };
		});
	}

	/** Sanitize free-form text into a safe FTS5 phrase OR-query: keep only
	 * word tokens of 3+ letters and quote each so punctuation cannot become
	 * query syntax (FTS5 throws on `?`, `"`, `*`, `:`, …). Returns '' if
	 * nothing usable remains. */
	function ftsSafe(query: string): string {
		const terms = query
			.split(/[^a-z0-9]+/i)
			.map((t) => t.replace(/"/g, '""'))
			.filter((t) => t.length > 2)
			.map((t) => `"${t}"`);
		return terms.length ? terms.join(' OR ') : '';
	}

	function ftsCandidateIds(content: string, limit = 200): { noteId: string; bm25: number }[] {
		const match = ftsSafe(content);
		if (!match) return [];
		const rows = db
			.prepare(
				`SELECT note_id, bm25(notes_fts) AS score
				 FROM notes_fts WHERE notes_fts MATCH ? ORDER BY score LIMIT ?`
			)
			.all(match, limit) as unknown as { note_id: string; score: number }[];
		const min = rows.length ? Math.min(...rows.map((r) => r.score)) : 0;
		return rows.map((r) => ({ noteId: r.note_id, bm25: min - r.score }));
	}

	function countNotes(): number {
		return (db.prepare('SELECT COUNT(*) AS c FROM notes').get() as { c: number }).c;
	}

	function latestTimestamp(): number {
		const r = db.prepare('SELECT MAX(created_at) AS m FROM notes').get() as { m: number | null };
		return r.m ?? 0;
	}

	function getWeeklyRecap(weekKey: string): { content: string } | null {
		const r = db.prepare('SELECT content FROM weekly_recaps WHERE week_key = ?').get(weekKey) as
			| { content: string }
			| undefined;
		return r ?? null;
	}

	function saveWeeklyRecap(weekKey: string, content: string): void {
		const now = Date.now();
		db.prepare(
			`INSERT INTO weekly_recaps (week_key, content, created_at, updated_at)
			 VALUES (?, ?, ?, ?)
			 ON CONFLICT(week_key) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at`
		).run(weekKey, content, now, now);
	}

	function insertAsk(question: string, answer: string, sourcesJson: string): string {
		const id = crypto.randomUUID();
		db.prepare(
			`INSERT INTO ask_history (id, question, answer, sources, created_at)
			 VALUES (?, ?, ?, ?, ?)`
		).run(id, question, answer, sourcesJson, Date.now());
		return id;
	}

	function listAsks(): Ask[] {
		const rows = db
			.prepare('SELECT id, question, answer, sources, created_at FROM ask_history ORDER BY created_at DESC, id DESC')
			.all() as unknown as AskRow[];
		return rows.map(rowToAsk);
	}

	function deleteAsk(id: string): boolean {
		return db.prepare('DELETE FROM ask_history WHERE id = ?').run(id).changes > 0;
	}

	return {
		db,
		Schema: SCHEMA,
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
		listPrinciples,
		createPrinciple,
		updatePrinciple,
		deletePrinciple,
		setPrincipleOrder,
		listTagColors,
		setTagColor
	};
}

export type Journal = ReturnType<typeof createJournal>;
