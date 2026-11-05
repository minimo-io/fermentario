import type { SearchHit } from '../search.ts';
import type { TagCount } from '../tag-cloud.ts';
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
		position   INTEGER NOT NULL DEFAULT 0,
		created_at INTEGER NOT NULL
	);

	CREATE TABLE IF NOT EXISTS todo_items (
		id         TEXT PRIMARY KEY,
		group_id   TEXT NOT NULL REFERENCES todo_groups(id) ON DELETE CASCADE,
		content    TEXT NOT NULL,
		done       INTEGER NOT NULL DEFAULT 0,
		done_at    INTEGER NOT NULL DEFAULT 0,
		in_progress INTEGER NOT NULL DEFAULT 0,
		subgroup   TEXT NOT NULL DEFAULT '',
		video      TEXT NOT NULL DEFAULT '',
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
		created_at INTEGER NOT NULL,
		video      TEXT NOT NULL DEFAULT ''
	);

	CREATE TABLE IF NOT EXISTS principle_tags (
		principle_id TEXT NOT NULL REFERENCES principles(id) ON DELETE CASCADE,
		tag          TEXT NOT NULL,
		PRIMARY KEY (principle_id, tag)
	);

	CREATE TABLE IF NOT EXISTS principle_comments (
		id           TEXT PRIMARY KEY,
		principle_id TEXT NOT NULL REFERENCES principles(id) ON DELETE CASCADE,
		content      TEXT NOT NULL,
		created_at   INTEGER NOT NULL
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

	CREATE TABLE IF NOT EXISTS note_comments (
		id         TEXT PRIMARY KEY,
		note_id    TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
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
	/** Comments live in note_comments; batched with the tags query. */
	commentCount?: number;
	/** Outgoing `[[id]]` links with live labels, batched with the tags query. */
	linkedNotes?: LinkRef[];
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
	position: number;
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
	subgroup: string;
	video: string;
	tags: string[];
}

export interface Principle {
	id: string;
	content: string;
	position: number;
	created_at: number;
	video: string;
	tags: string[];
	commentCount: number;
	/** Outgoing `[[id]]` links with live labels, batched like note links. */
	linkedNotes?: LinkRef[];
}

export interface PrincipleComment {
	id: string;
	principle_id: string;
	content: string;
	created_at: number;
	pinned: boolean;
}

export interface TaskComment {
	id: string;
	item_id: string;
	content: string;
	created_at: number;
	pinned: boolean;
}

export interface NoteComment {
	id: string;
	note_id: string;
	content: string;
	created_at: number;
	pinned: boolean;
}

/** Comments read `pinned` from SQLite as 0/1; the public type is boolean. */
type CommentRow<T> = Omit<T, 'pinned'> & { pinned: number };

function rowToComment<T extends { pinned: boolean }>(row: CommentRow<T>): T {
	return { ...row, pinned: row.pinned === 1 } as T;
}

export type CommentPatch = { content?: string; pinned?: boolean };

export interface TodoProgressItem extends TodoItem {
	groupName: string;
}

export interface TodoDoneCursor {
	done_at: number;
	id: string;
}

export type StockKind = 'consumable' | 'durable';

export interface StockItem {
	id: string;
	kind: StockKind;
	name: string;
	note: string;
	quantity: number;
	duration_days: number;
	bought_at: number | null;
	price: number | null;
	currency: string;
	bought_where: string;
	ended_at: number | null;
	hasPhoto: boolean;
	created_at: number;
	updated_at: number;
}

export interface StockItemInput {
	kind: StockKind;
	name: string;
	note?: string;
	quantity?: number;
	duration_days?: number;
	bought_at?: number | null;
	price?: number | null;
	currency?: string;
	bought_where?: string;
	ended_at?: number | null;
}

/** A resolved `[[id]]` link: notes and principles share the syntax, and the
 *  label always renders live from the target. */
export interface LinkRef {
	id: string;
	label: string;
	kind: 'note' | 'principle';
}

export interface TodoDonePage {
	items: TodoProgressItem[];
	count: number;
	hasMore: boolean;
	nextCursor: TodoDoneCursor | null;
}

/** Outgoing note links use `[[uuid]]`. The label is never stored: it renders
 *  live from the target's current first line, so edits never go stale. */
const LINK_RE = /\[\[([0-9a-fA-F-]{36})\]\]/g;

export function noteLinkIds(content: string): string[] {
	const ids: string[] = [];
	LINK_RE.lastIndex = 0;
	let m: RegExpExecArray | null;
	while ((m = LINK_RE.exec(content)) !== null) {
		if (!ids.includes(m[1])) ids.push(m[1]);
	}
	return ids;
}

/** Pill label: first non-empty line, capped so a long note stays a pill. */
export function noteLabel(content: string): string {
	const line = content.split('\n').map((s) => s.trim()).find(Boolean) ?? '';
	return line.length > 80 ? `${line.slice(0, 80)}…` : line;
}

export interface Holding {
	id: string;
	ticker: string;
	amount: number;
	/** Manual price in the holding's currency; null until set. */
	price: number | null;
	/** True when the price came from the rates refresh (BTC auto-price). */
	priceAuto: boolean;
	currency: string;
	category: HoldingCategory;
	/** Desired amount in the holding's currency; null until set. */
	goal: number | null;
	bank: string;
	country: string;
	position: number;
	created_at: number;
	updated_at: number;
	/** Last write of `price` (quote refresh or hand edit); 0 when never set. */
	price_updated_at: number;
	/** Average cost per unit on the opening row; null until set. */
	avgPrice: number | null;
	/** Converted value in USD; present on list output. */
	valueUsd?: number;
}

export type HoldingActionKind = 'opening' | 'buy' | 'sell';

export interface HoldingAction {
	id: string;
	holding_id: string;
	kind: HoldingActionKind;
	amount: number;
	/** Unit price at the time of the action; null when no quote was cached. */
	price: number | null;
	currency: string;
	created_at: number;
}

export type HoldingCategory = 'btc' | 'fii' | 'cash';

/** Buys and sells per calendar day, for the investments heatmap. */
export interface TradeDay {
	day: string;
	buys: number;
	sells: number;
}

export interface TradeHistoryItem {
	id: string;
	holding_id: string;
	ticker: string;
	bank: string;
	category: HoldingCategory;
	kind: 'buy' | 'sell';
	amount: number;
	price: number | null;
	currency: string;
	created_at: number;
}

export interface TradeHistoryCursor {
	created_at: number;
	id: string;
}

export interface TradeHistoryPage {
	items: TradeHistoryItem[];
	count: number;
	hasMore: boolean;
	nextCursor: TradeHistoryCursor | null;
}

export interface CategoryShare {
	category: HoldingCategory;
	actual: number;
	goal: number;
}

/** Absolute target, independent from the percent allocation goals. */
export interface CategoryValueGoal {
	amount: number;
	currency: string;
}

export interface CategoryValueProgress {
	category: HoldingCategory;
	target: number;
	currency: string;
	/** Current category value in the target currency; null when no rate exists. */
	actual: number | null;
	/** Current category value in USD, the value the totals use. */
	actualUsd: number;
	/** target - actual; null when no rate exists. */
	gap: number | null;
	/** actual / target * 100; null when no rate exists. */
	pct: number | null;
}

export interface HoldingsSummary {
	holdings: Holding[];
	totalUsd: number;
	/** Newest rate timestamp behind the total; null when no FX was needed. */
	asOf: number | null;
	/** True when a needed rate is missing or older than a day. */
	stale: boolean;
	goals: { btc: number; fii: number; cash: number } | null;
	/** Independent absolute targets; null when none are set. */
	valueGoals: { btc: CategoryValueGoal | null; fii: CategoryValueGoal | null; cash: CategoryValueGoal | null } | null;
	/** Progress for each category that has an absolute target. */
	valueProgress: CategoryValueProgress[];
	actual: { btc: number; fii: number; cash: number };
	/** Configured categories off their goal by more than 5 points. */
	drift: CategoryShare[];
	displayTotals: { USD: number; BRL: number | null; UYU: number | null };
}

const rowToNote = (r: NoteRow, tags: string[] = [], comments = 0, links: LinkRef[] = []): Note => ({
	id: r.id,
	content: r.content,
	created_at: r.created_at,
	updated_at: r.updated_at,
	featured: r.featured === 1,
	video: r.video ?? '',
	tags,
	commentCount: comments,
	linkedNotes: links
});

const rowToAsk = (r: AskRow) => ({
	id: r.id,
	question: r.question,
	answer: r.answer,
	sources: JSON.parse(r.sources || '[]'),
	created_at: r.created_at
});

/** One-line preview around the first match. The palette highlights `query`. */
function clipSearchText(text: string, query: string, max = 200): string {
	const flat = text.replace(/\s+/g, ' ').trim();
	if (flat.length <= max) return flat;
	const at = flat.toLowerCase().indexOf(query.toLowerCase());
	const start = Math.max(0, at < 0 ? 0 : at - 60);
	const end = Math.min(flat.length, start + max);
	return `${start > 0 ? '…' : ''}${flat.slice(start, end).trim()}${end < flat.length ? '…' : ''}`;
}

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

	/** Comment totals per note id, batched the way tagsByNote batches tags. */
	function commentsByNote(rows: { id: string }[]): Map<string, number> {
		const map = new Map<string, number>();
		if (rows.length === 0) return map;
		const ids = rows.map((r) => r.id);
		const placeholders = ids.map(() => '?').join(',');
		const countRows = db
			.prepare(`SELECT note_id, COUNT(*) AS c FROM note_comments WHERE note_id IN (${placeholders}) GROUP BY note_id`)
			.all(...ids) as unknown as { note_id: string; c: number }[];
		for (const row of countRows) map.set(row.note_id, row.c);
		return map;
	}

	/** Linked-entry labels per source id, batched the way tagsByNote batches
	 *  tags. Notes resolve first, then principles; ids with no live target
	 *  resolve to no entry and render as plain text. */
	function resolveLinks(wanted: Map<string, string[]>): Map<string, LinkRef[]> {
		const map = new Map<string, LinkRef[]>();
		if (wanted.size === 0) return map;
		const allIds = [...new Set([...wanted.values()].flat())];
		const placeholders = allIds.map(() => '?').join(',');
		const found = new Map<string, LinkRef>();
		const noteTargets = db
			.prepare(`SELECT id, content FROM notes WHERE id IN (${placeholders})`)
			.all(...allIds) as unknown as { id: string; content: string }[];
		for (const t of noteTargets) found.set(t.id, { id: t.id, label: noteLabel(t.content), kind: 'note' });
		const missing = allIds.filter((id) => !found.has(id));
		if (missing.length > 0) {
			const missingPlaceholders = missing.map(() => '?').join(',');
			const principleTargets = db
				.prepare(`SELECT id, content FROM principles WHERE id IN (${missingPlaceholders})`)
				.all(...missing) as unknown as { id: string; content: string }[];
			for (const t of principleTargets) found.set(t.id, { id: t.id, label: noteLabel(t.content), kind: 'principle' });
		}
		for (const [sourceId, ids] of wanted) {
			const links: LinkRef[] = [];
			for (const id of ids) {
				const target = found.get(id);
				if (target !== undefined) links.push(target);
			}
			if (links.length > 0) map.set(sourceId, links);
		}
		return map;
	}

	function linksByNote(rows: { id: string; content: string }[]): Map<string, LinkRef[]> {
		if (rows.length === 0) return new Map();
		const wanted = new Map<string, string[]>();
		for (const r of rows) {
			const ids = noteLinkIds(r.content).filter((id) => id !== r.id);
			if (ids.length > 0) wanted.set(r.id, ids);
		}
		return resolveLinks(wanted);
	}

	function linksByPrinciple(rows: { id: string; content: string }[]): Map<string, LinkRef[]> {
		if (rows.length === 0) return new Map();
		const wanted = new Map<string, string[]>();
		for (const r of rows) {
			const ids = noteLinkIds(r.content).filter((id) => id !== r.id);
			if (ids.length > 0) wanted.set(r.id, ids);
		}
		return resolveLinks(wanted);
	}

	function withTags(rows: NoteRow[]): Note[] {
		const tags = tagsByNote(rows);
		const comments = commentsByNote(rows);
		const links = linksByNote(rows);
		return rows.map((r) =>
			rowToNote(r, tags.get(r.id) ?? [], comments.get(r.id) ?? 0, links.get(r.id) ?? [])
		);
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
		if (done) {
			db.prepare('DELETE FROM notes_fts WHERE note_id = ?').run(id);
			db.prepare('DELETE FROM note_comments WHERE note_id = ?').run(id);
		}
		return done;
	}

	/** Replace a note's content and optionally its date. `updated_at` always
	 *  moves past `created_at` so the "edited" marker can rely on a strict
	 *  comparison. Returns null when the note does not exist. */
	function updateNote(id: string, content: string, createdAt?: number): Note | null {
		const existing = db.prepare('SELECT created_at FROM notes WHERE id = ?').get(id) as
			| { created_at: number }
			| undefined;
		if (!existing) return null;
		const created =
			typeof createdAt === 'number' && Number.isFinite(createdAt) && createdAt > 0
				? createdAt
				: existing.created_at;
		const now = Math.max(Date.now(), created + 1);
		db.prepare('UPDATE notes SET content = ?, created_at = ?, updated_at = ? WHERE id = ?').run(
			content,
			created,
			now,
			id
		);
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
			.prepare('SELECT * FROM todo_groups ORDER BY position ASC, created_at ASC, id ASC')
			.all() as unknown as TodoGroup[];
	}

	function createTodoGroup(name: string): TodoGroup | null {
		const clean = name.trim();
		if (!clean) return null;
		const now = Date.now();
		const id = crypto.randomUUID();
		const max = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM todo_groups').get() as { m: number };
		db.prepare('INSERT INTO todo_groups (id, name, position, created_at) VALUES (?, ?, ?, ?)').run(id, clean, max.m + 1, now);
		return { id, name: clean, position: max.m + 1, created_at: now };
	}

	/** Persist a full group order. Unknown ids are ignored. */
	function setTodoGroupOrder(ids: string[]): void {
		const upd = db.prepare('UPDATE todo_groups SET position = ? WHERE id = ?');
		db.transaction(() => {
			ids.forEach((id, i) => upd.run(i, id));
		});
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
		subgroup: string;
		video: string;
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
		subgroup: r.subgroup ?? '',
		video: r.video ?? '',
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

	function createTodoItem(groupId: string, content: string, createdAt: number, subgroup = '', video = ''): TodoItem | null {
		const group = db.prepare('SELECT id FROM todo_groups WHERE id = ?').get(groupId) as unknown as { id: string } | undefined;
		if (!group) return null;
		const clean = content.trim();
		if (!clean) return null;
		const max = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM todo_items WHERE group_id = ?').get(groupId) as { m: number };
		const id = crypto.randomUUID();
		db.prepare(
			'INSERT INTO todo_items (id, group_id, content, done, done_at, in_progress, subgroup, video, position, created_at, updated_at) VALUES (?, ?, ?, 0, 0, 0, ?, ?, ?, ?, ?)'
		).run(id, groupId, clean, subgroup, video, max.m + 1, createdAt, createdAt);
		return { id, group_id: groupId, content: clean, done: false, done_at: 0, inProgress: false, position: max.m + 1, created_at: createdAt, updated_at: createdAt, commentCount: 0, subgroup, video, tags: [] };
	}

	/** Edit text and/or checked state. `updated_at` always moves past
	 *  `created_at`. Checking stamps `done_at`; unchecking clears it.
	 *  Returns null when the item does not exist. */
	function updateTodoItem(id: string, patch: { content?: string; done?: boolean; inProgress?: boolean; subgroup?: string; video?: string; group_id?: string }): TodoItem | null {
		const existing = db.prepare('SELECT * FROM todo_items WHERE id = ?').get(id) as unknown as TodoItemRow | undefined;
		if (!existing) return null;
		const content = patch.content !== undefined ? patch.content.trim() : existing.content;
		if (!content) return null;
		// Moving groups appends at the end of the target list.
		let groupId = existing.group_id;
		let position = existing.position ?? 0;
		if (patch.group_id !== undefined && patch.group_id !== existing.group_id) {
			const target = db.prepare('SELECT id FROM todo_groups WHERE id = ?').get(patch.group_id) as unknown as { id: string } | undefined;
			if (!target) return null;
			const max = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM todo_items WHERE group_id = ?').get(patch.group_id) as { m: number };
			groupId = patch.group_id;
			position = max.m + 1;
		}
		const done = patch.done !== undefined ? (patch.done ? 1 : 0) : existing.done;
		const now = Math.max(Date.now(), existing.created_at + 1);
		const doneAt = patch.done !== undefined ? (patch.done ? now : 0) : (existing.done_at ?? 0);
		// Completing a task always ends its in-progress state.
		const inProgress = done
			? 0
			: patch.inProgress !== undefined
				? patch.inProgress
					? 1
					: 0
				: (existing.in_progress ?? 0);
		const subgroup = patch.subgroup !== undefined ? patch.subgroup : (existing.subgroup ?? '');
		const video = patch.video !== undefined ? patch.video : (existing.video ?? '');
		db.prepare('UPDATE todo_items SET content = ?, done = ?, done_at = ?, in_progress = ?, subgroup = ?, video = ?, group_id = ?, position = ?, updated_at = ? WHERE id = ?').run(content, done, doneAt, inProgress, subgroup, video, groupId, position, now, id);
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
				 WHERE i.in_progress = 1 AND i.done = 0 ORDER BY i.updated_at DESC, i.id DESC`
			)
			.all() as unknown as (TodoItemRow & { group_name: string })[];
		const tags = tagsByItem(rows);
		return rows.map((r) => ({ ...rowToTodoItem(r, tags.get(r.id) ?? []), groupName: r.group_name }));
	}

	/** Done items across every group, latest completion first. */
	function listDoneItems(limit = 50, cursor: TodoDoneCursor | null = null): TodoDonePage {
		const safeLimit = Number.isFinite(limit) ? Math.min(100, Math.max(1, Math.trunc(limit))) : 50;
		const cursorSql = cursor ? 'AND (i.done_at < ? OR (i.done_at = ? AND i.id < ?))' : '';
		const params: SqlValue[] = cursor ? [cursor.done_at, cursor.done_at, cursor.id] : [];
		const rows = db
			.prepare(
				`SELECT i.*, g.name AS group_name,
					(SELECT COUNT(*) FROM task_comments c WHERE c.item_id = i.id) AS comment_count
				 FROM todo_items i JOIN todo_groups g ON g.id = i.group_id
				 WHERE i.done = 1 ${cursorSql}
				 ORDER BY i.done_at DESC, i.id DESC LIMIT ?`
			)
			.all(...params, safeLimit + 1) as unknown as (TodoItemRow & { group_name: string })[];
		const hasMore = rows.length > safeLimit;
		const page = hasMore ? rows.slice(0, safeLimit) : rows;
		const tags = tagsByItem(page);
		const items = page.map((r) => ({
			...rowToTodoItem(r, tags.get(r.id) ?? []),
			groupName: r.group_name
		}));
		const last = page[page.length - 1];
		const count = (db.prepare('SELECT COUNT(*) AS c FROM todo_items WHERE done = 1').get() as { c: number }).c;
		return {
			items,
			count,
			hasMore,
			nextCursor: hasMore && last ? { done_at: last.done_at, id: last.id } : null
		};
	}

	/** Persist a full item order inside one group. Unknown ids are ignored. */
	function setTodoItemOrder(groupId: string, ids: string[]): void {
		const upd = db.prepare('UPDATE todo_items SET position = ? WHERE id = ? AND group_id = ?');
		db.transaction(() => {
			ids.forEach((id, i) => upd.run(i, id, groupId));
		});
	}

	// --- Task comments -----------------------------------------------------
	// History of a task's evolution. Edits keep the original timestamp, so
	// the timeline does not reorder. Deleting needs a confirm on the client.

	function listTaskComments(itemId: string): TaskComment[] {
		const rows = db
			.prepare('SELECT * FROM task_comments WHERE item_id = ? ORDER BY pinned DESC, created_at DESC, id DESC')
			.all(itemId) as unknown as CommentRow<TaskComment>[];
		return rows.map(rowToComment);
	}

	function createTaskComment(itemId: string, content: string): TaskComment | null {
		const group = db.prepare('SELECT id FROM todo_items WHERE id = ?').get(itemId) as unknown as { id: string } | undefined;
		if (!group) return null;
		const clean = content.trim();
		if (!clean) return null;
		const id = crypto.randomUUID();
		const now = Date.now();
		db.prepare('INSERT INTO task_comments (id, item_id, content, created_at) VALUES (?, ?, ?, ?)').run(id, itemId, clean, now);
		return { id, item_id: itemId, content: clean, created_at: now, pinned: false };
	}

	function updateTaskComment(itemId: string, id: string, patch: CommentPatch): TaskComment | null {
		const current = db
			.prepare('SELECT * FROM task_comments WHERE id = ? AND item_id = ?')
			.get(id, itemId) as unknown as CommentRow<TaskComment> | undefined;
		if (!current) return null;
		const clean = patch.content === undefined ? current.content : patch.content.trim();
		if (!clean) return null;
		const pinned = patch.pinned === undefined ? current.pinned === 1 : patch.pinned;
		if (current.content !== clean || (current.pinned === 1) !== pinned) {
			db.prepare('UPDATE task_comments SET content = ?, pinned = ? WHERE id = ? AND item_id = ?').run(
				clean,
				pinned ? 1 : 0,
				id,
				itemId
			);
		}
		return { ...current, content: clean, pinned };
	}

	function deleteTaskComment(itemId: string, id: string): boolean {
		return db.prepare('DELETE FROM task_comments WHERE id = ? AND item_id = ?').run(id, itemId).changes > 0;
	}

	function listNoteComments(noteId: string): NoteComment[] {
		const rows = db
			.prepare('SELECT * FROM note_comments WHERE note_id = ? ORDER BY pinned DESC, created_at DESC, id DESC')
			.all(noteId) as unknown as CommentRow<NoteComment>[];
		return rows.map(rowToComment);
	}

	function createNoteComment(noteId: string, content: string): NoteComment | null {
		const note = db.prepare('SELECT id FROM notes WHERE id = ?').get(noteId) as unknown as
			| { id: string }
			| undefined;
		if (!note) return null;
		const clean = content.trim();
		if (!clean) return null;
		const id = crypto.randomUUID();
		const now = Date.now();
		db.prepare('INSERT INTO note_comments (id, note_id, content, created_at) VALUES (?, ?, ?, ?)').run(id, noteId, clean, now);
		return { id, note_id: noteId, content: clean, created_at: now, pinned: false };
	}

	function updateNoteComment(noteId: string, id: string, patch: CommentPatch): NoteComment | null {
		const current = db
			.prepare('SELECT * FROM note_comments WHERE id = ? AND note_id = ?')
			.get(id, noteId) as unknown as CommentRow<NoteComment> | undefined;
		if (!current) return null;
		const clean = patch.content === undefined ? current.content : patch.content.trim();
		if (!clean) return null;
		const pinned = patch.pinned === undefined ? current.pinned === 1 : patch.pinned;
		if (current.content !== clean || (current.pinned === 1) !== pinned) {
			db.prepare('UPDATE note_comments SET content = ?, pinned = ? WHERE id = ? AND note_id = ?').run(
				clean,
				pinned ? 1 : 0,
				id,
				noteId
			);
		}
		return { ...current, content: clean, pinned };
	}

	function deleteNoteComment(noteId: string, id: string): boolean {
		return db.prepare('DELETE FROM note_comments WHERE id = ? AND note_id = ?').run(id, noteId).changes > 0;
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

	function tagsByPrinciple(rows: { id: string }[]): Map<string, string[]> {
		const map = new Map<string, string[]>();
		if (rows.length === 0) return map;
		const ids = rows.map((r) => r.id);
		const placeholders = ids.map(() => '?').join(',');
		const tagRows = db
			.prepare(`SELECT principle_id, tag FROM principle_tags WHERE principle_id IN (${placeholders}) ORDER BY tag`)
			.all(...ids) as unknown as { principle_id: string; tag: string }[];
		for (const t of tagRows) {
			if (!map.has(t.principle_id)) map.set(t.principle_id, []);
			map.get(t.principle_id)!.push(t.tag);
		}
		return map;
	}

	function listPrinciples(): Principle[] {
		const rows = db
			.prepare(
				`SELECT p.*, (SELECT COUNT(*) FROM principle_comments c WHERE c.principle_id = p.id) AS comment_count
				 FROM principles p ORDER BY p.position ASC, p.created_at ASC, p.id ASC`
			)
			.all() as unknown as (Omit<Principle, 'tags' | 'commentCount' | 'video' | 'linkedNotes'> & { video: string; comment_count: number })[];
		const tags = tagsByPrinciple(rows);
		const links = linksByPrinciple(rows);
		return rows.map((r) => ({ ...r, video: r.video ?? '', tags: tags.get(r.id) ?? [], commentCount: r.comment_count ?? 0, linkedNotes: links.get(r.id) ?? [] }));
	}

	function listPrinciplesByTag(tag: string): Principle[] {
		const clean = tag.trim().toLowerCase();
		if (!clean) return [];
		const rows = db
			.prepare(
				`SELECT p.*, (SELECT COUNT(*) FROM principle_comments c WHERE c.principle_id = p.id) AS comment_count
				 FROM principles p JOIN principle_tags t ON t.principle_id = p.id
				 WHERE t.tag = ? ORDER BY p.position ASC, p.created_at ASC, p.id ASC`
			)
			.all(clean) as unknown as (Omit<Principle, 'tags' | 'commentCount' | 'video' | 'linkedNotes'> & { video: string; comment_count: number })[];
		const tags = tagsByPrinciple(rows);
		const links = linksByPrinciple(rows);
		return rows.map((r) => ({ ...r, video: r.video ?? '', tags: tags.get(r.id) ?? [], commentCount: r.comment_count ?? 0, linkedNotes: links.get(r.id) ?? [] }));
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
		return { id, content: clean, position: max.m + 1, created_at: now, video: '', tags: [], commentCount: 0 };
	}

	function updatePrinciple(id: string, content: string): Principle | null {
		const clean = content.trim();
		if (!clean) return null;
		const done = db.prepare('UPDATE principles SET content = ? WHERE id = ?').run(clean, id).changes > 0;
		if (!done) return null;
		return updatePrincipleKeepTags(id);
	}

	/** Set or clear the YouTube video id. Empty clears. Touches only its column. */
	function setPrincipleVideo(id: string, video: string): Principle | null {
		const done = db.prepare('UPDATE principles SET video = ? WHERE id = ?').run(video, id).changes > 0;
		if (!done) return null;
		return updatePrincipleKeepTags(id);
	}

	function updatePrincipleKeepTags(id: string): Principle | null {
		const row = db.prepare('SELECT * FROM principles WHERE id = ?').get(id) as unknown as (Omit<Principle, 'tags' | 'commentCount' | 'video' | 'linkedNotes'> & { video: string } | undefined);
		if (!row) return null;
		const count = db.prepare('SELECT COUNT(*) AS c FROM principle_comments WHERE principle_id = ?').get(id) as { c: number };
		return { ...row, video: row.video ?? '', tags: tagsByPrinciple([row]).get(id) ?? [], commentCount: count.c ?? 0, linkedNotes: linksByPrinciple([row]).get(id) ?? [] };
	}

	/** Replace a principle's tags. Passing an empty array clears them. */
	function setPrincipleTags(principleId: string, tags: string[]): void {
		const clean = [...new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))].slice(0, 12);
		db.prepare('DELETE FROM principle_tags WHERE principle_id = ?').run(principleId);
		if (clean.length === 0) return;
		const ins = db.prepare('INSERT INTO principle_tags (principle_id, tag) VALUES (?, ?)');
		db.transaction(() => {
			for (const t of clean) ins.run(principleId, t);
		});
	}

	function deletePrinciple(id: string): boolean {
		return db.prepare('DELETE FROM principles WHERE id = ?').run(id).changes > 0;
	}

	// --- Principle comments ---------------------------------------------------
	// History mirroring task comments. Edits keep the original timestamp;
	// deleting one needs a confirm on the client.

	function listPrincipleComments(principleId: string): PrincipleComment[] {
		const rows = db
			.prepare(
				'SELECT * FROM principle_comments WHERE principle_id = ? ORDER BY pinned DESC, created_at DESC, id DESC'
			)
			.all(principleId) as unknown as CommentRow<PrincipleComment>[];
		return rows.map(rowToComment);
	}

	function createPrincipleComment(principleId: string, content: string): PrincipleComment | null {
		const exists = db.prepare('SELECT id FROM principles WHERE id = ?').get(principleId) as unknown as { id: string } | undefined;
		if (!exists) return null;
		const clean = content.trim();
		if (!clean) return null;
		const id = crypto.randomUUID();
		const now = Date.now();
		db.prepare('INSERT INTO principle_comments (id, principle_id, content, created_at) VALUES (?, ?, ?, ?)').run(id, principleId, clean, now);
		return { id, principle_id: principleId, content: clean, created_at: now, pinned: false };
	}

	function updatePrincipleComment(
		principleId: string,
		id: string,
		patch: CommentPatch
	): PrincipleComment | null {
		const current = db
			.prepare('SELECT * FROM principle_comments WHERE id = ? AND principle_id = ?')
			.get(id, principleId) as unknown as CommentRow<PrincipleComment> | undefined;
		if (!current) return null;
		const clean = patch.content === undefined ? current.content : patch.content.trim();
		if (!clean) return null;
		const pinned = patch.pinned === undefined ? current.pinned === 1 : patch.pinned;
		if (current.content !== clean || (current.pinned === 1) !== pinned) {
			db.prepare('UPDATE principle_comments SET content = ?, pinned = ? WHERE id = ? AND principle_id = ?').run(
				clean,
				pinned ? 1 : 0,
				id,
				principleId
			);
		}
		return { ...current, content: clean, pinned };
	}

	function deletePrincipleComment(principleId: string, id: string): boolean {
		return db.prepare('DELETE FROM principle_comments WHERE id = ? AND principle_id = ?').run(id, principleId).changes > 0;
	}

	/** Persist a full order. Unknown ids are ignored; missing rows keep
	 *  their relative order after the listed ones. */
	function setPrincipleOrder(ids: string[]): void {
		const upd = db.prepare('UPDATE principles SET position = ? WHERE id = ?');
		db.transaction(() => {
			ids.forEach((id, i) => upd.run(i, id));
		});
	}

	// --- Holdings ------------------------------------------------------------
	// Investing boxes on the home carousel. Prices are manual until the rates
	// refresh fills them: fiat converts through fx_rates, BTC-ticker rows take
	// the fetched BTC price while their price is auto (or unset). A manual
	// price edit clears the auto flag so refreshes never overwrite it.

	type HoldingRow = {
		id: string;
		ticker: string;
		amount: number;
		price: number | null;
		price_auto: number;
		currency: string;
		category: string;
		goal: number | null;
		bank: string;
		country: string;
		position: number;
		created_at: number;
		updated_at: number;
		price_updated_at: number;
	};

	const DAY_MS = 24 * 60 * 60 * 1000;
	const RATES_URL = 'https://api.coinbase.com/v2/exchange-rates?currency=USD';
	const YAHOO_UA =
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

	/** Yahoo symbol: B3 codes get `.SA` (`SNEL11` → `SNEL11.SA`); a ticker
	 *  that already carries a dot is used as-is (`AAPL` stays US). */
	function yahooSymbol(ticker: string): string {
		const t = ticker.toUpperCase();
		if (t.includes('.')) return t;
		return isB3(t) ? `${t}.SA` : t;
	}

	function isB3(ticker: string): boolean {
		const t = ticker.toUpperCase();
		return !t.includes('.') && /^[A-Z]{4}\d{1,2}[A-Z0-9]?$/.test(t);
	}

	/** Latest quote for a B3 ticker from Fundamentus (`Cotação` row).
	 *  Null on any failure — unknown ticker, layout change, non-numeric. */
	async function fetchFundamentusQuote(ticker: string): Promise<number | null> {
		try {
			const res = await fetch(
				`https://www.fundamentus.com.br/detalhes.php?papel=${encodeURIComponent(ticker.toUpperCase())}`,
				{ signal: AbortSignal.timeout(10000), headers: { 'user-agent': YAHOO_UA } }
			);
			if (!res.ok) return null;
			const html = new TextDecoder('iso-8859-1').decode(new Uint8Array(await res.arrayBuffer()));
			const m = /Cotação<\/span><\/td>\s*<td class="data[^"]*"><span class="txt">([\d.,]+)<\/span>/.exec(html);
			if (!m) return null;
			// Brazilian format: dots group thousands, comma is the decimal.
			const v = Number(m[1].replace(/\./g, '').replace(',', '.'));
			return Number.isFinite(v) && v > 0 ? v : null;
		} catch {
			return null;
		}
	}

	/** Latest price from the Yahoo chart API. Null on any failure — the
	 *  caller keeps the cached price and marks the summary stale instead. */
	async function fetchQuote(symbol: string): Promise<number | null> {
		try {
			const res = await fetch(
				`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`,
				{ signal: AbortSignal.timeout(8000), headers: { 'user-agent': YAHOO_UA } }
			);
			if (!res.ok) return null;
			const body = (await res.json()) as {
				chart?: { result?: { meta?: { regularMarketPrice?: unknown } }[] };
			};
			const p = body?.chart?.result?.[0]?.meta?.regularMarketPrice;
			return typeof p === 'number' && Number.isFinite(p) && p > 0 ? p : null;
		} catch {
			return null;
		}
	}

	function cleanBank(v: unknown): string {
		return String(v ?? '').trim().slice(0, 40);
	}

	function cleanCountry(v: unknown): string {
		const c = String(v ?? '').trim().toUpperCase();
		return /^[A-Z]{2}$/.test(c) ? c : '';
	}

	/** Cash holdings are named by bank: the ticker is a slug of it. */
	function bankTicker(bank: string): string | null {
		const t = bank
			.trim()
			.toUpperCase()
			.replace(/\s+/g, '-')
			.replace(/[^A-Z0-9._-]/g, '')
			.slice(0, 12);
		return /^[A-Z0-9._-]{1,12}$/.test(t) ? t : null;
	}

	function rowToHolding(r: HoldingRow, toUsd: Map<string, number>, avgPrice: number | null = null): Holding {
		const rate = toUsd.get(r.currency) ?? 1;
		return {
			id: r.id,
			ticker: r.ticker,
			amount: r.amount,
			price: r.price,
			priceAuto: r.price_auto === 1,
			currency: r.currency,
			category: cleanCategory(r.category, r.ticker),
			goal: r.goal,
			bank: r.bank ?? '',
			country: r.country ?? '',
			position: r.position,
			created_at: r.created_at,
			updated_at: r.updated_at,
			price_updated_at: r.price_updated_at ?? 0,
			avgPrice,
			valueUsd: r.amount * (r.price ?? 0) * rate
		};
	}

	/** Opening average prices in one query; keep listing holdings cheap. */
	function openingPrices(): Map<string, number | null> {
		const rows = db
			.prepare("SELECT holding_id, price FROM holding_actions WHERE kind = 'opening'")
			.all() as unknown as { holding_id: string; price: number | null }[];
		return new Map(rows.map((r) => [r.holding_id, r.price]));
	}

	function fxToUsd(): { rates: Map<string, number>; at: Map<string, number> } {
		const rates = new Map<string, number>([['USD', 1]]);
		const at = new Map<string, number>();
		try {
			const rows = db.prepare('SELECT currency, rate_to_usd, fetched_at FROM fx_rates').all() as unknown as {
				currency: string;
				rate_to_usd: number;
				fetched_at: number;
			}[];
			for (const row of rows) {
				rates.set(row.currency, row.rate_to_usd);
				at.set(row.currency, row.fetched_at);
			}
		} catch {
			// Table arrives with migration 3; an older open journal reads USD-only.
		}
		return { rates, at };
	}

	function listHoldings(): Holding[] {
		const { rates } = fxToUsd();
		const avg = openingPrices();
		const rows = db
			.prepare('SELECT * FROM holdings ORDER BY position ASC, created_at ASC, id ASC')
			.all() as unknown as HoldingRow[];
		// Totals stay fixed first in the UI; the rest sort by money, with
		// position only breaking ties. Rates are known only post-query, so
		// the sort happens here, not in SQL.
		return rows
			.map((r) => rowToHolding(r, rates, avg.get(r.id) ?? null))
			.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0) || a.position - b.position);
	}

	function cleanTicker(v: unknown): string | null {
		const t = String(v ?? '').trim().toUpperCase();
		return /^[A-Z0-9._-]{1,12}$/.test(t) ? t : null;
	}

	function cleanCurrency(v: unknown): string {
		const c = String(v ?? 'USD').trim().toUpperCase();
		return /^[A-Z]{3}$/.test(c) ? c : 'USD';
	}

	const HOLDING_CATEGORIES = ['btc', 'fii', 'cash'] as const;

	function cleanCategory(v: unknown, ticker: string): HoldingCategory {
		if (v === 'btc' || v === 'fii' || v === 'cash') return v;
		return ticker.toUpperCase() === 'BTC' ? 'btc' : 'fii';
	}

	function createHolding(
		ticker: string,
		amount: number,
		price?: number | null,
		currency?: string,
		category?: string,
		goal?: number | null,
		bank?: string,
		country?: string,
		avgPrice?: number | null
	): Holding | null {
		const a = Number(amount);
		const p = price === undefined || price === null ? null : Number(price);
		const g = goal === undefined || goal === null ? null : Number(goal);
		const avg = avgPrice === undefined || avgPrice === null ? null : Number(avgPrice);
		if (!Number.isFinite(a) || a < 0) return null;
		if (p !== null && (!Number.isFinite(p) || p < 0)) return null;
		if (g !== null && (!Number.isFinite(g) || g < 0)) return null;
		if (avg !== null && (!Number.isFinite(avg) || avg < 0)) return null;
		const cat = cleanCategory(category, String(ticker ?? ''));
		const t = cat === 'cash' ? bankTicker(bank ?? '') : cleanTicker(ticker);
		if (!t) return null;
		const max = db.prepare('SELECT COALESCE(MAX(position), -1) AS m FROM holdings').get() as { m: number };
		const id = crypto.randomUUID();
		const now = Date.now();
		const c = cat === 'btc' ? 'USD' : cleanCurrency(currency);
		// Cash counts at face value; BTC takes the fetched price — both hide
		// the price field, so the stored price is derived, never typed.
		const storedPrice = cat === 'cash' ? 1 : cat === 'btc' ? null : p;
		const b = cat === 'cash' ? cleanBank(bank) : '';
		const co = cat === 'cash' ? cleanCountry(country) : '';
		// The opening row is the base quantity. Its price is the average cost
		// the user enters; it never becomes the live quote.
		const openingPrice = cat === 'cash' ? 1 : avg;
		db.transaction(() => {
			db.prepare(
				'INSERT INTO holdings (id, ticker, amount, price, price_auto, currency, category, goal, bank, country, position, created_at, updated_at, price_updated_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
			).run(id, t, a, storedPrice, c, cat, g, b, co, max.m + 1, now, now, storedPrice === null ? 0 : now);
			db.prepare(
				'INSERT INTO holding_actions (id, holding_id, kind, amount, price, currency, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
			).run(crypto.randomUUID(), id, 'opening', a, openingPrice, c, now);
		});
		const { rates } = fxToUsd();
		return rowToHolding(
			{ id, ticker: t, amount: a, price: storedPrice, price_auto: 0, currency: c, category: cat, goal: g, bank: b, country: co, position: max.m + 1, created_at: now, updated_at: now, price_updated_at: storedPrice === null ? 0 : now },
			rates,
			openingPrice
		);
	}

	function updateHolding(
		id: string,
		patch: { ticker?: string; amount?: number; price?: number | null; currency?: string; category?: string; goal?: number | null; bank?: string; country?: string; avgPrice?: number | null }
	): Holding | null {
		const current = db.prepare('SELECT * FROM holdings WHERE id = ?').get(id) as unknown as HoldingRow | undefined;
		if (!current) return null;
		const prevCategory = cleanCategory(current.category, current.ticker);
		const category = patch.category === undefined ? prevCategory : cleanCategory(patch.category, patch.ticker ?? current.ticker);
		const bank = patch.bank === undefined ? (current.bank ?? '') : cleanBank(patch.bank);
		const country = patch.country === undefined ? (current.country ?? '') : cleanCountry(patch.country);
		const ticker = category === 'cash' ? bankTicker(bank) : patch.ticker === undefined ? current.ticker : cleanTicker(patch.ticker);
		if (!ticker) return null;
		const amount = patch.amount === undefined ? current.amount : Number(patch.amount);
		if (!Number.isFinite(amount) || amount < 0) return null;
		const currency = category === 'btc' ? 'USD' : patch.currency === undefined ? current.currency : cleanCurrency(patch.currency);
		// A different ticker or category makes the stored quote meaningless:
		// drop it and re-arm auto mode so the next refresh fills the new one.
		// An explicit price still wins (API compatibility); cash never uses
		// one, and BTC always prices itself.
		const identityChanged = category !== prevCategory || ticker !== current.ticker;
		let price: number | null;
		if (category === 'cash') price = 1;
		else if (category === 'btc') price = identityChanged ? null : current.price;
		else if (patch.price !== undefined) price = patch.price === null ? null : Number(patch.price);
		else price = identityChanged ? null : current.price;
		if (price !== null && (!Number.isFinite(price) || price < 0)) return null;
		const goal = patch.goal === undefined ? current.goal : patch.goal === null ? null : Number(patch.goal);
		if (goal !== null && (!Number.isFinite(goal) || goal < 0)) return null;
		const priceAuto = category === 'cash' ? 0 : patch.price === undefined ? (identityChanged ? 1 : current.price_auto) : 0;
		// The average cost lives on the opening row. An API amount change
		// shifts that row by the same delta, so the ledger keeps summing to
		// the current total; the UI changes quantity through actions only.
		const avgProvided = patch.avgPrice !== undefined;
		const avg = avgProvided ? (category === 'cash' ? 1 : patch.avgPrice === null ? null : Number(patch.avgPrice)) : null;
		if (avg !== null && (!Number.isFinite(avg) || avg < 0)) return null;
		type OpeningRow = { id: string; amount: number; price: number | null };
		const opening = db
			.prepare("SELECT id, amount, price FROM holding_actions WHERE holding_id = ? AND kind = 'opening' ORDER BY created_at ASC, rowid ASC LIMIT 1")
			.get(id) as unknown as OpeningRow | undefined;
		const nextOpeningAmount = opening ? opening.amount + (amount - current.amount) : amount;
		if (nextOpeningAmount < 0) return null;
		const now = Date.now();
		// The date shown on the card means "price fetched or typed", so only a
		// real price change moves it — editing the amount must not fake it.
		const priceUpdatedAt = price === current.price ? current.price_updated_at ?? 0 : price === null ? 0 : now;
		db.transaction(() => {
			db.prepare(
				'UPDATE holdings SET ticker = ?, amount = ?, price = ?, price_auto = ?, currency = ?, category = ?, goal = ?, bank = ?, country = ?, updated_at = ?, price_updated_at = ? WHERE id = ?'
			).run(ticker, amount, price, priceAuto, currency, category, goal, bank, country, now, priceUpdatedAt, id);
			if (opening) {
				if (nextOpeningAmount !== opening.amount) {
					db.prepare('UPDATE holding_actions SET amount = ? WHERE id = ?').run(nextOpeningAmount, opening.id);
				}
				if (avgProvided) {
					db.prepare('UPDATE holding_actions SET price = ?, currency = ? WHERE id = ?').run(avg, currency, opening.id);
				}
			} else {
				db.prepare(
					'INSERT INTO holding_actions (id, holding_id, kind, amount, price, currency, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
				).run(crypto.randomUUID(), id, 'opening', amount, avgProvided ? avg : null, currency, current.created_at);
			}
		});
		const openingNow = db
			.prepare("SELECT price FROM holding_actions WHERE holding_id = ? AND kind = 'opening' LIMIT 1")
			.get(id) as unknown as { price: number | null } | undefined;
		const { rates } = fxToUsd();
		return rowToHolding(
			{ ...current, ticker, amount, price, price_auto: priceAuto, currency, category, goal, bank, country, updated_at: now, price_updated_at: priceUpdatedAt },
			rates,
			openingNow?.price ?? null
		);
	}

	function deleteHolding(id: string): boolean {
		return db.transaction(() => {
			db.prepare('DELETE FROM holding_actions WHERE holding_id = ?').run(id);
			return db.prepare('DELETE FROM holdings WHERE id = ?').run(id).changes > 0;
		});
	}

	function readHoldingActions(holdingId: string): HoldingAction[] {
		return db
			.prepare(
				'SELECT id, holding_id, kind, amount, price, currency, created_at FROM holding_actions WHERE holding_id = ? ORDER BY created_at DESC, rowid DESC'
			)
			.all(holdingId) as unknown as HoldingAction[];
	}

	// --- Stock items ----------------------------------------------------

	interface StockItemRow {
		id: string;
		kind: string;
		name: string;
		note: string;
		quantity: number;
		duration_days: number;
		bought_at: number | null;
		price: number | null;
		currency: string;
		bought_where: string;
		ended_at: number | null;
		has_photo: number;
		created_at: number;
		updated_at: number;
	}

	function cleanStockKind(v: unknown): StockKind {
		return v === 'durable' ? 'durable' : 'consumable';
	}

	const rowToStockItem = (r: StockItemRow): StockItem => ({
		id: r.id,
		kind: cleanStockKind(r.kind),
		name: r.name,
		note: r.note ?? '',
		quantity: Number(r.quantity ?? 0),
		duration_days: Number(r.duration_days ?? 0),
		bought_at: r.bought_at ?? null,
		price: r.price ?? null,
		currency: r.currency ?? 'BRL',
		bought_where: r.bought_where ?? '',
		ended_at: r.ended_at ?? null,
		hasPhoto: r.has_photo === 1,
		created_at: r.created_at,
		updated_at: r.updated_at
	});

	function cleanStockInput(input: StockItemInput): Omit<StockItem, 'id' | 'hasPhoto' | 'created_at' | 'updated_at'> | null {
		const kind = cleanStockKind(input.kind);
		const name = String(input.name ?? '').trim().slice(0, 80);
		if (!name) return null;
		const note = String(input.note ?? '').trim().slice(0, 2000);
		const num = (v: unknown): number => {
			const n = Number(v);
			return Number.isFinite(n) && n >= 0 ? n : NaN;
		};
		const currency = /^[A-Z]{3}$/.test(String(input.currency ?? 'BRL').trim().toUpperCase())
			? String(input.currency ?? 'BRL').trim().toUpperCase()
			: 'BRL';
		const boughtWhere = String(input.bought_where ?? '').trim().slice(0, 80);
		if (kind === 'consumable') {
			const quantity = num(input.quantity ?? NaN);
			const duration = num(input.duration_days ?? NaN);
			if (!Number.isFinite(quantity) || !Number.isFinite(duration)) return null;
			return {
				kind,
				name,
				note,
				quantity,
				duration_days: duration,
				bought_at: null,
				price: null,
				currency: 'BRL',
				bought_where: '',
				ended_at: null
			};
		}
		const priceRaw = input.price === undefined || input.price === null ? null : Number(input.price);
		if (priceRaw !== null && (!Number.isFinite(priceRaw) || priceRaw < 0)) return null;
		const boughtAt = input.bought_at === undefined || input.bought_at === null ? null : Number(input.bought_at);
		if (boughtAt !== null && (!Number.isFinite(boughtAt) || boughtAt <= 0)) return null;
		const endedAt = input.ended_at === undefined || input.ended_at === null ? null : Number(input.ended_at);
		if (endedAt !== null && (!Number.isFinite(endedAt) || endedAt <= 0)) return null;
		return {
			kind,
			name,
			note,
			quantity: 0,
			duration_days: 0,
			bought_at: boughtAt,
			price: priceRaw,
			currency,
			bought_where: boughtWhere,
			ended_at: endedAt
		};
	}

	function listStockItems(): StockItem[] {
		let rows: StockItemRow[];
		try {
			rows = db
				.prepare(
					`SELECT id, kind, name, note, quantity, duration_days, bought_at, price, currency, bought_where, ended_at, has_photo, created_at, updated_at
					 FROM stock_items`
				)
				.all() as unknown as StockItemRow[];
		} catch {
			// Table arrives with migration 11.
			return [];
		}
		return rows
			.map(rowToStockItem)
			.sort((a, b) => {
				if (a.kind !== b.kind) return a.kind === 'consumable' ? -1 : 1;
				if (a.kind === 'consumable') {
					const ra = a.quantity * a.duration_days;
					const rb = b.quantity * b.duration_days;
					// Empty stock sinks; otherwise soonest exhaustion first.
					if (ra <= 0 && rb <= 0) return a.name.localeCompare(b.name);
					if (ra <= 0) return 1;
					if (rb <= 0) return -1;
					return ra - rb || a.name.localeCompare(b.name);
				}
				const aActive = a.ended_at === null ? 0 : 1;
				const bActive = b.ended_at === null ? 0 : 1;
				if (aActive !== bActive) return aActive - bActive;
				if (aActive === 0) return (b.bought_at ?? 0) - (a.bought_at ?? 0) || a.name.localeCompare(b.name);
				return (b.ended_at ?? 0) - (a.ended_at ?? 0) || a.name.localeCompare(b.name);
			});
	}

	function getStockItem(id: string): StockItem | null {
		let r: StockItemRow | undefined;
		try {
			r = db
				.prepare(
					`SELECT id, kind, name, note, quantity, duration_days, bought_at, price, currency, bought_where, ended_at, has_photo, created_at, updated_at
					 FROM stock_items WHERE id = ?`
				)
				.get(id) as unknown as StockItemRow | undefined;
		} catch {
			return null;
		}
		return r ? rowToStockItem(r) : null;
	}

	function createStockItem(input: StockItemInput): StockItem | null {
		const clean = cleanStockInput(input);
		if (!clean) return null;
		const now = Date.now();
		const id = crypto.randomUUID();
		try {
			db.prepare(
				`INSERT INTO stock_items (id, kind, name, note, quantity, duration_days, bought_at, price, currency, bought_where, ended_at, photo, photo_mime, has_photo, created_at, updated_at)
				 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, '', 0, ?, ?)`
			).run(
				id,
				clean.kind,
				clean.name,
				clean.note,
				clean.quantity,
				clean.duration_days,
				clean.bought_at,
				clean.price,
				clean.currency,
				clean.bought_where,
				clean.ended_at,
				now,
				now
			);
		} catch {
			return null;
		}
		return { ...clean, id, hasPhoto: false, created_at: now, updated_at: now };
	}

	function updateStockItem(id: string, input: Partial<StockItemInput>): StockItem | null {
		const existing = getStockItem(id);
		if (!existing) return null;
		// The kind is fixed at creation: the form never changes tabs mid-edit.
		const merged: StockItemInput = {
			kind: existing.kind,
			name: input.name !== undefined ? input.name : existing.name,
			note: input.note !== undefined ? input.note : existing.note,
			quantity: input.quantity !== undefined ? input.quantity : existing.quantity,
			duration_days: input.duration_days !== undefined ? input.duration_days : existing.duration_days,
			bought_at: input.bought_at !== undefined ? input.bought_at : existing.bought_at,
			price: input.price !== undefined ? input.price : existing.price,
			currency: input.currency !== undefined ? input.currency : existing.currency,
			bought_where: input.bought_where !== undefined ? input.bought_where : existing.bought_where,
			ended_at: input.ended_at !== undefined ? input.ended_at : existing.ended_at
		};
		const clean = cleanStockInput(merged);
		if (!clean) return null;
		const now = Math.max(Date.now(), existing.created_at + 1);
		try {
			db.prepare(
				`UPDATE stock_items SET name = ?, note = ?, quantity = ?, duration_days = ?, bought_at = ?, price = ?,
				 currency = ?, bought_where = ?, ended_at = ?, updated_at = ? WHERE id = ?`
			).run(
				clean.name,
				clean.note,
				clean.quantity,
				clean.duration_days,
				clean.bought_at,
				clean.price,
				clean.currency,
				clean.bought_where,
				clean.ended_at,
				now,
				id
			);
		} catch {
			return null;
		}
		return getStockItem(id);
	}

	function deleteStockItem(id: string): boolean {
		try {
			return db.prepare('DELETE FROM stock_items WHERE id = ?').run(id).changes > 0;
		} catch {
			return false;
		}
	}

	function setStockItemPhoto(id: string, photo: Uint8Array | null, mime: string): StockItem | null {
		const existing = getStockItem(id);
		if (!existing) return null;
		const now = Math.max(Date.now(), existing.created_at + 1);
		try {
			if (photo === null) {
				db.prepare('UPDATE stock_items SET photo = NULL, photo_mime = ?, has_photo = 0, updated_at = ? WHERE id = ?').run('', now, id);
			} else {
				db.prepare('UPDATE stock_items SET photo = ?, photo_mime = ?, has_photo = 1, updated_at = ? WHERE id = ?').run(
					photo as unknown as string,
					mime,
					now,
					id
				);
			}
		} catch {
			return null;
		}
		return getStockItem(id);
	}

	function getStockItemPhoto(id: string): { photo: Uint8Array; mime: string; updatedAt: number } | null {
		let r: { photo: unknown; photo_mime: string; updated_at: number } | undefined;
		try {
			r = db
				.prepare('SELECT photo, photo_mime, updated_at FROM stock_items WHERE id = ?')
				.get(id) as unknown as { photo: unknown; photo_mime: string; updated_at: number } | undefined;
		} catch {
			return null;
		}
		if (!r || r.photo === null || r.photo === undefined) return null;
		const bytes = toBytes(r.photo);
		if (bytes.length === 0) return null;
		return { photo: bytes, mime: r.photo_mime || 'image/jpeg', updatedAt: r.updated_at };
	}

	function listHoldingActions(holdingId: string): HoldingAction[] | null {
		const exists = db.prepare('SELECT id FROM holdings WHERE id = ?').get(holdingId);
		return exists ? readHoldingActions(holdingId) : null;
	}

	/** Buys and sells across every holding, newest first. Opening rows are
	 *  the starting balance, not an event, so they stay out. */
	function listTradeHistory(
		limit = 50,
		cursor: TradeHistoryCursor | null = null
	): TradeHistoryPage {
		const safeLimit = Number.isFinite(limit) ? Math.min(100, Math.max(1, Math.trunc(limit))) : 50;
		const cursorSql = cursor ? 'AND (a.created_at < ? OR (a.created_at = ? AND a.id < ?))' : '';
		const params: SqlValue[] = cursor ? [cursor.created_at, cursor.created_at, cursor.id] : [];
		const rows = db
			.prepare(
				`SELECT a.id, a.holding_id, a.kind, a.amount, a.price, a.currency, a.created_at,
				        h.ticker, h.bank, h.category
				 FROM holding_actions a JOIN holdings h ON h.id = a.holding_id
				 WHERE a.kind IN ('buy', 'sell') ${cursorSql}
				 ORDER BY a.created_at DESC, a.id DESC LIMIT ?`
			)
			.all(...params, safeLimit + 1) as unknown as TradeHistoryItem[];
		const hasMore = rows.length > safeLimit;
		const items = hasMore ? rows.slice(0, safeLimit) : rows;
		const last = items[items.length - 1];
		const count = (
			db.prepare("SELECT COUNT(*) AS c FROM holding_actions WHERE kind IN ('buy', 'sell')").get() as {
				c: number;
			}
		).c;
		return {
			items,
			count,
			hasMore,
			nextCursor: hasMore && last ? { created_at: last.created_at, id: last.id } : null
		};
	}

	type RecordActionResult =
		| { ok: true; action: HoldingAction; holding: Holding; actions: HoldingAction[] }
		| { ok: false; reason: 'not_found' | 'invalid' | 'insufficient' };

	function recordHoldingAction(holdingId: string, kind: string, amount: number): RecordActionResult {
		if (kind !== 'buy' && kind !== 'sell') return { ok: false, reason: 'invalid' };
		const qty = Number(amount);
		if (!Number.isFinite(qty) || qty <= 0) return { ok: false, reason: 'invalid' };
		return db.transaction((): RecordActionResult => {
			const current = db.prepare('SELECT * FROM holdings WHERE id = ?').get(holdingId) as unknown as HoldingRow | undefined;
			if (!current) return { ok: false, reason: 'not_found' };
			if (kind === 'sell' && qty > current.amount + 1e-9) return { ok: false, reason: 'insufficient' };
			const now = Date.now();
			const action: HoldingAction = {
				id: crypto.randomUUID(),
				holding_id: holdingId,
				kind,
				amount: qty,
				price: current.price,
				currency: current.currency,
				created_at: now
			};
			db.prepare(
				'INSERT INTO holding_actions (id, holding_id, kind, amount, price, currency, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
			).run(action.id, holdingId, kind, qty, action.price, action.currency, now);
			const next = kind === 'buy' ? current.amount + qty : current.amount - qty;
			const clean = next < 1e-9 ? 0 : next;
			db.prepare('UPDATE holdings SET amount = ?, updated_at = ? WHERE id = ?').run(clean, now, holdingId);
			const updated = db.prepare('SELECT * FROM holdings WHERE id = ?').get(holdingId) as unknown as HoldingRow;
			const opening = db
				.prepare("SELECT price FROM holding_actions WHERE holding_id = ? AND kind = 'opening' LIMIT 1")
				.get(holdingId) as unknown as { price: number | null } | undefined;
			const { rates } = fxToUsd();
			return {
				ok: true,
				action,
				holding: rowToHolding(updated, rates, opening?.price ?? null),
				actions: readHoldingActions(holdingId)
			};
		});
	}

	function getCategoryGoals(): { btc: number; fii: number; cash: number } | null {
		try {
			const rows = db.prepare('SELECT category, pct FROM category_goals').all() as unknown as { category: string; pct: number }[];
			const map = new Map(rows.map((r) => [r.category, r.pct]));
			const btc = map.get('btc');
			const fii = map.get('fii');
			const cash = map.get('cash');
			if (btc === undefined || fii === undefined || cash === undefined) return null;
			return { btc, fii, cash };
		} catch {
			// Table arrives with migration 4.
			return null;
		}
	}

	function getCategoryValueGoals(): {
		btc: CategoryValueGoal | null;
		fii: CategoryValueGoal | null;
		cash: CategoryValueGoal | null;
	} | null {
		try {
			const rows = db
				.prepare('SELECT category, amount, currency FROM category_value_goals')
				.all() as unknown as { category: string; amount: number; currency: string }[];
			if (rows.length === 0) return null;
			const map = new Map(rows.map((r) => [r.category, { amount: r.amount, currency: r.currency }]));
			return {
				btc: map.get('btc') ?? null,
				fii: map.get('fii') ?? null,
				cash: map.get('cash') ?? null
			};
		} catch {
			// Table arrives with migration 9.
			return null;
		}
	}

	type GoalWrite = { ok: true } | { ok: false; field: 'pct' | 'values' };

	/** Absolute targets are optional per category and independent from the
	 *  percent goals. A `null` category clears its target. */
	function setHoldingsGoals(
		pct: { btc: number; fii: number; cash: number } | null,
		values: { btc: number | null; fii: number | null; cash: number | null } | null
	): GoalWrite {
		if (pct) {
			for (const v of [pct.btc, pct.fii, pct.cash]) {
				if (!Number.isFinite(v) || v < 0 || v > 100) return { ok: false, field: 'pct' };
			}
			if (Math.abs(pct.btc + pct.fii + pct.cash - 100) > 1e-9) return { ok: false, field: 'pct' };
		}
		if (values) {
			for (const c of HOLDING_CATEGORIES) {
				const v = values[c];
				if (v !== null && (!Number.isFinite(v) || v <= 0)) return { ok: false, field: 'values' };
			}
		}
		const VALUE_CURRENCY: Record<HoldingCategory, string> = { btc: 'USD', fii: 'BRL', cash: 'BRL' };
		db.transaction(() => {
			if (pct) {
				const put = db.prepare(
					'INSERT INTO category_goals (category, pct) VALUES (?, ?) ON CONFLICT (category) DO UPDATE SET pct = excluded.pct'
				);
				put.run('btc', pct.btc);
				put.run('fii', pct.fii);
				put.run('cash', pct.cash);
			}
			if (values) {
				db.prepare('DELETE FROM category_value_goals').run();
				const put = db.prepare(
					'INSERT INTO category_value_goals (category, amount, currency) VALUES (?, ?, ?)'
				);
				for (const c of HOLDING_CATEGORIES) {
					const v = values[c];
					if (v !== null) put.run(c, v, VALUE_CURRENCY[c]);
				}
			}
		});
		return { ok: true };
	}

	function getHoldingsSummary(): HoldingsSummary {
		const holdings = listHoldings();
		const { rates, at } = fxToUsd();
		const now = Date.now();
		let stale = false;
		let asOf: number | null = null;
		const needBtc = holdings.some((h) => h.ticker === 'BTC' && (h.priceAuto || h.price === null));
		const consider = (c: string) => {
			const fetched = at.get(c);
			if (fetched === undefined || !rates.has(c)) {
				stale = true;
				return;
			}
			asOf = asOf === null ? fetched : Math.min(asOf, fetched);
			if (now - fetched > DAY_MS) stale = true;
		};
		for (const h of holdings) {
			if (h.currency === 'USD') continue;
			consider(h.currency);
		}
		if (needBtc) consider('BTC');
		// The collapsed header and the totals card state UYU and BRL totals,
		// so those rates are needed display data, not just conversion input.
		consider('BRL');
		consider('UYU');
		if (
			holdings.some(
				(h) =>
					h.ticker !== 'BTC' &&
					h.category !== 'cash' &&
					(h.price === null || (h.priceAuto && now - h.price_updated_at > DAY_MS))
			)
		) {
			stale = true;
		}
		const totalUsd = holdings.reduce((s, h) => s + (h.valueUsd ?? 0), 0);
		const displayTotals = {
			USD: totalUsd,
			BRL: rates.has('BRL') ? totalUsd / (rates.get('BRL') as number) : null,
			UYU: rates.has('UYU') ? totalUsd / (rates.get('UYU') as number) : null
		};
		const actual = { btc: 0, fii: 0, cash: 0 };
		if (totalUsd > 0) {
			for (const h of holdings) actual[h.category] += (h.valueUsd ?? 0) / totalUsd;
			for (const k of HOLDING_CATEGORIES) actual[k] = actual[k] * 100;
		}
		const goals = getCategoryGoals();
		const drift: CategoryShare[] =
			goals === null
				? []
				: HOLDING_CATEGORIES.filter((c) => Math.abs(actual[c] - goals[c]) > 5).map((c) => ({
						category: c,
						actual: actual[c],
						goal: goals[c]
					}));
		const valueGoals = getCategoryValueGoals();
		const valueProgress: CategoryValueProgress[] = [];
		if (valueGoals) {
			for (const c of HOLDING_CATEGORIES) {
				const goal = valueGoals[c];
				if (!goal) continue;
				const actualUsd = (actual[c] / 100) * totalUsd;
				// Rates are per USD; divide to express the value in the target
				// currency. A missing rate leaves the progress unknown, never 1:1.
				const rate = goal.currency === 'USD' ? 1 : rates.get(goal.currency);
				const actualValue = rate === undefined ? null : actualUsd / rate;
				valueProgress.push({
					category: c,
					target: goal.amount,
					currency: goal.currency,
					actual: actualValue,
					actualUsd,
					gap: actualValue === null ? null : goal.amount - actualValue,
					pct: actualValue === null ? null : (actualValue / goal.amount) * 100
				});
			}
		}
		return { holdings, totalUsd, asOf, stale, goals, valueGoals, valueProgress, actual, drift, displayTotals };
	}

	/** Refresh fiat rates and auto-prices (BTC plus stock/FII quotes). Skips
	 *  the network when every needed rate is younger than a day, unless
	 *  forced. A forced refresh refetches every auto-priced holding, even a
	 *  quote fetched minutes ago; the daily cache only applies to quiet
	 *  loads. Throws on network or parse failure; the route answers with
	 *  the cached summary instead. A single bad ticker never stops the rest. */
	async function refreshRates(force = false): Promise<HoldingsSummary> {
		const rows = db.prepare('SELECT DISTINCT UPPER(currency) AS c FROM holdings').all() as unknown as { c: string }[];
		// BRL and UYU are always needed: the header and totals card state
		// those totals even for an all-USD portfolio.
		const fiats = [...new Set([...rows.map((r) => r.c), 'BRL', 'UYU'])].filter((c) => c !== 'USD');
		const btcEmpty = db.prepare("SELECT id FROM holdings WHERE UPPER(ticker) = 'BTC' AND price IS NULL").all() as unknown as {
			id: string;
		}[];
		const btcAuto = db.prepare("SELECT id FROM holdings WHERE UPPER(ticker) = 'BTC' AND price_auto = 1 AND price IS NOT NULL").all() as unknown as {
			id: string;
		}[];
		const stockEmpty = db
			.prepare("SELECT id, ticker FROM holdings WHERE UPPER(ticker) != 'BTC' AND category != 'cash' AND price IS NULL")
			.all() as unknown as { id: string; ticker: string }[];
		const stockStale = db
			.prepare(
				"SELECT id, ticker FROM holdings WHERE UPPER(ticker) != 'BTC' AND category != 'cash' AND price_auto = 1 AND price IS NOT NULL AND price_updated_at < ?"
			)
			// A forced refresh must select fresh auto quotes too. Applying
			// `force` only to the early return left a FII quoted hours ago
			// untouched, and its edit modal kept yesterday's timestamp.
			.all(force ? Date.now() + 1 : Date.now() - DAY_MS) as unknown as { id: string; ticker: string }[];
		const stockRows = [...stockEmpty, ...stockStale.filter((r) => !stockEmpty.some((e) => e.id === r.id))];
		if (fiats.length === 0 && btcEmpty.length === 0 && btcAuto.length === 0 && stockRows.length === 0) {
			return getHoldingsSummary();
		}
		const { at } = fxToUsd();
		const now = Date.now();
		const fresh = (c: string): boolean => {
			const f = at.get(c);
			return f !== undefined && now - f < DAY_MS;
		};
		const ratesFresh = fiats.length === 0 || fiats.every(fresh);
		const btcFresh = fresh('BTC');
		if (
			!force &&
			ratesFresh &&
			btcEmpty.length === 0 &&
			(btcAuto.length === 0 || btcFresh) &&
			stockRows.length === 0
		) {
			return getHoldingsSummary();
		}
		if (typeof fetch !== 'function') throw new Error('network unavailable');
		const res = await fetch(RATES_URL, { signal: AbortSignal.timeout(10000) });
		if (!res.ok) throw new Error(`rates HTTP ${res.status}`);
		const body = (await res.json()) as { data?: { rates?: Record<string, string> } };
		const rates = body?.data?.rates;
		if (!rates || typeof rates !== 'object') throw new Error('bad rates payload');
		const put = db.prepare(
			'INSERT INTO fx_rates (currency, rate_to_usd, fetched_at) VALUES (?, ?, ?) ON CONFLICT (currency) DO UPDATE SET rate_to_usd = excluded.rate_to_usd, fetched_at = excluded.fetched_at'
		);
		db.transaction(() => {
			for (const c of fiats) {
				const perUsd = Number(rates[c]);
				if (Number.isFinite(perUsd) && perUsd > 0) put.run(c, 1 / perUsd, now);
			}
		});
		const btcPerUsd = Number(rates['BTC']);
		const hasBtcRate = Number.isFinite(btcPerUsd) && btcPerUsd > 0;
		if (hasBtcRate) {
			put.run('BTC', 1 / (btcPerUsd as number), now);
			const btcUsd = 1 / (btcPerUsd as number);
			const upd = db.prepare('UPDATE holdings SET price = ?, price_auto = 1, updated_at = ?, price_updated_at = ? WHERE id = ?');
			const targets = [...btcEmpty, ...btcAuto];
			db.transaction(() => {
				for (const r of targets) upd.run(btcUsd, now, now, r.id);
			});
		}
		if (stockRows.length > 0) {
			const upd = db.prepare('UPDATE holdings SET price = ?, price_auto = 1, updated_at = ?, price_updated_at = ? WHERE id = ?');
			for (let i = 0; i < stockRows.length; i++) {
				// Stagger hits: Yahoo 429s rapid sequential requests.
				if (i > 0) await new Promise((r) => setTimeout(r, 500));
				const t = stockRows[i]!.ticker;
				const quote = isB3(t) ? await fetchFundamentusQuote(t) : await fetchQuote(yahooSymbol(t));
				if (quote !== null) {
					const at = Date.now();
					upd.run(quote, at, at, stockRows[i]!.id);
				}
			}
		}
		return getHoldingsSummary();
	}

	// --- Tag counts -------------------------------------------------------

	/** Every tag in use, with counts per section. `tag_colors` is not a source:
	 *  a stored color can outlive its items, and an orphan must not appear in
	 *  the cloud. */
	function listTagCounts(): TagCount[] {
		return db
			.prepare(
				`SELECT tag,
				        SUM(notes) AS notes,
				        SUM(todos) AS todos,
				        SUM(principles) AS principles,
				        SUM(notes + todos + principles) AS count
				 FROM (
				   SELECT tag, COUNT(*) AS notes, 0 AS todos, 0 AS principles FROM note_tags GROUP BY tag
				   UNION ALL
				   SELECT tag, 0 AS notes, COUNT(*) AS todos, 0 AS principles FROM todo_item_tags GROUP BY tag
				   UNION ALL
				   SELECT tag, 0 AS notes, 0 AS todos, COUNT(*) AS principles FROM principle_tags GROUP BY tag
				 )
				 GROUP BY tag
				 ORDER BY count DESC, tag ASC`
			)
			.all() as unknown as TagCount[];
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

	/** Case-insensitive substring search for the global palette.
	 *
	 *  Notes have FTS, but tasks and principles do not. One `LIKE` model for
	 *  all three keeps short queries predictable: `notes_fts` ignores tokens
	 *  shorter than three characters and never matches a substring. */
	function searchJournal(query: string, limit = 10): SearchHit[] {
		const q = query.trim();
		if (q.length < 2) return [];
		const cap = Math.max(1, Math.min(50, Math.trunc(limit)));
		const escaped = q.replace(/[!%_]/g, (ch) => `!${ch}`);
		const like = `%${escaped}%`;

		const notes = db
			.prepare(
				`SELECT id, content, updated_at AS at
				 FROM notes
				 WHERE content LIKE ? ESCAPE '!'
				 ORDER BY updated_at DESC, id DESC
				 LIMIT ?`
			)
			.all(like, cap) as unknown as { id: string; content: string; at: number }[];

		const todos = db
			.prepare(
				`SELECT i.id, i.content, i.updated_at AS at, i.done, i.in_progress, g.name AS group_name
				 FROM todo_items i JOIN todo_groups g ON g.id = i.group_id
				 WHERE i.content LIKE ? ESCAPE '!'
				 ORDER BY i.updated_at DESC, i.id DESC
				 LIMIT ?`
			)
			.all(like, cap) as unknown as {
				id: string;
				content: string;
				at: number;
				done: number;
				in_progress: number;
				group_name: string;
			}[];

		const principles = db
			.prepare(
				`SELECT id, content, created_at AS at
				 FROM principles
				 WHERE content LIKE ? ESCAPE '!'
				 ORDER BY position ASC, created_at ASC, id ASC
				 LIMIT ?`
			)
			.all(like, cap) as unknown as { id: string; content: string; at: number }[];

		return [
			...notes.map((r) => ({
				kind: 'note' as const,
				id: r.id,
				text: clipSearchText(r.content, q),
				context: '',
				at: r.at
			})),
			...todos.map((r) => ({
				kind: 'todo' as const,
				id: r.id,
				text: clipSearchText(r.content, q),
				context: `${r.group_name} · ${r.done ? 'Done' : r.in_progress ? 'In progress' : 'Open'}`,
				at: r.at
			})),
			...principles.map((r) => ({
				kind: 'principle' as const,
				id: r.id,
				text: clipSearchText(r.content, q),
				context: '',
				at: r.at
			}))
		];
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
		setVector,
		allVectors,
		ftsCandidateIds,
		searchJournal,
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
		listDoneItems,
		listTaskComments,
		createTaskComment,
		updateTaskComment,
		deleteTaskComment,
		listNoteComments,
		createNoteComment,
		updateNoteComment,
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
		updatePrincipleComment,
		deletePrincipleComment,
		listHoldings,
		createHolding,
		updateHolding,
		deleteHolding,
		listHoldingActions,
		listTradeHistory,
		recordHoldingAction,
		getHoldingsSummary,
		getCategoryGoals,
		setHoldingsGoals,
		refreshRates,
		listStockItems,
		getStockItem,
		createStockItem,
		updateStockItem,
		deleteStockItem,
		setStockItemPhoto,
		getStockItemPhoto,
		listTagColors,
		listTagCounts,
		setTagColor
	};
}

export type Journal = ReturnType<typeof createJournal>;
