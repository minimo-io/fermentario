import type { SqlDb } from './sqlite.ts';
import { SCHEMA } from './journal.ts';

/**
 * Ordered schema migrations for every journal database.
 *
 * Version 1 is the baseline: it brings both a brand-new database and a
 * database written before migration tracking to the same current schema. From
 * version 2 on, each change gets a new migration. Never edit an applied
 * migration.
 *
 * The runner lives here, next to the migration list, so the server and the
 * maintenance scripts execute the same code.
 */

export interface Migration {
	version: number;
	name: string;
	up(db: SqlDb): void;
}

export interface MigrationOptions {
	/**
	 * Called once before the first pending migration. The journal store uses it
	 * to write a backup. A thrown error stops the migration before any change.
	 */
	beforeMigrate?: (fromVersion: number, toVersion: number) => void;
}

export class SchemaTooNewError extends Error {
	readonly databaseVersion: number;
	readonly supportedVersion: number;

	constructor(databaseVersion: number, supportedVersion: number) {
		super(
			`This database is version ${databaseVersion}, but this app supports version ${supportedVersion}. Update the app before opening it.`
		);
		this.databaseVersion = databaseVersion;
		this.supportedVersion = supportedVersion;
		this.name = 'SchemaTooNewError';
	}
}

function hasTable(db: SqlDb, table: string): boolean {
	const row = db
		.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
		.get<{ name: string }>(table);
	return row !== undefined;
}

function columns(db: SqlDb, table: string): Set<string> {
	return new Set(
		(db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((c) => c.name)
	);
}

function addColumn(db: SqlDb, table: string, name: string, definition: string): void {
	if (!columns(db, table).has(name)) {
		db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
	}
}

function ensureApplicationId(db: SqlDb): void {
	const current = Number(db.pragma('application_id', true));
	if (current !== 0x4645524d) db.exec('PRAGMA application_id = 0x4645524D');
}

function ensureUserVersion(db: SqlDb, version: number): void {
	const current = Number(db.pragma('user_version', true));
	if (current !== version) db.exec(`PRAGMA user_version = ${version}`);
}

function backfillPositions(db: SqlDb, table: string): void {
	const rows = db.prepare(`SELECT id FROM ${table} ORDER BY created_at ASC, id ASC`).all() as {
		id: string;
	}[];
	const update = db.prepare(`UPDATE ${table} SET position = ? WHERE id = ?`);
	db.transaction(() => {
		rows.forEach((row, i) => update.run(i, row.id));
	});
}

/** Baseline. It mirrors the old startup reconciliation in `db.ts`, but runs
 *  once and records itself in `schema_migrations`. */
const baseline: Migration = {
	version: 1,
	name: 'baseline',
	up(db) {
		const hadSearch = hasTable(db, 'notes_fts');
		db.exec(SCHEMA);
		if (!hadSearch) {
			// A journal old enough to lack the virtual table still deserves
			// working search after the import. The schema just created it
			// empty, so fill it from the notes that survived the migration.
			db.exec('INSERT INTO notes_fts (content, note_id) SELECT content, id FROM notes');
		}

		// Notes. `featured` and `video` are current columns; `in_progress` was
		// an experiment and belongs to todo items now.
		const noteColumns = columns(db, 'notes');
		if (!noteColumns.has('featured')) {
			db.exec('ALTER TABLE notes ADD COLUMN featured INTEGER NOT NULL DEFAULT 0');
		}
		if (!noteColumns.has('video')) {
			db.exec("ALTER TABLE notes ADD COLUMN video TEXT NOT NULL DEFAULT ''");
		}
		if (noteColumns.has('in_progress')) {
			db.exec('ALTER TABLE notes DROP COLUMN in_progress');
		}

		// To-Do groups and items. Position backfills creation order so existing
		// lists do not reshuffle under the user.
		const groupColumns = columns(db, 'todo_groups');
		if (!groupColumns.has('position')) {
			db.exec('ALTER TABLE todo_groups ADD COLUMN position INTEGER NOT NULL DEFAULT 0');
			backfillPositions(db, 'todo_groups');
		}

		const itemColumns = columns(db, 'todo_items');
		if (!itemColumns.has('done_at')) {
			db.exec('ALTER TABLE todo_items ADD COLUMN done_at INTEGER NOT NULL DEFAULT 0');
		}
		if (!itemColumns.has('position')) {
			db.exec('ALTER TABLE todo_items ADD COLUMN position INTEGER NOT NULL DEFAULT 0');
			backfillPositions(db, 'todo_items');
		}
		if (!itemColumns.has('in_progress')) {
			db.exec('ALTER TABLE todo_items ADD COLUMN in_progress INTEGER NOT NULL DEFAULT 0');
		}
		if (!itemColumns.has('subgroup')) {
			db.exec("ALTER TABLE todo_items ADD COLUMN subgroup TEXT NOT NULL DEFAULT ''");
		}
		db.exec('UPDATE todo_items SET in_progress = 0 WHERE done = 1 AND in_progress = 1');

		addColumn(db, 'principles', 'video', "TEXT NOT NULL DEFAULT ''");
	}
};

export const MIGRATIONS: Migration[] = [baseline];
export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1]!.version;

/** Read the recorded version. A database without the tracking table is 0. */
export function getSchemaVersion(db: SqlDb): number {
	if (!hasTable(db, 'schema_migrations')) return 0;
	const row = db.prepare('SELECT MAX(version) AS version FROM schema_migrations').get<{
		version: number | null;
	}>();
	return row?.version ?? 0;
}

/**
 * Apply every pending migration in order.
 *
 * The tracking table itself is created outside a migration so that a legacy
 * database can be stamped by migration 1. Each migration and its bookkeeping
 * row commit together.
 */
export function runMigrations(db: SqlDb, options: MigrationOptions = {}): number {
	db.exec(`
		CREATE TABLE IF NOT EXISTS schema_migrations (
			version    INTEGER PRIMARY KEY,
			name       TEXT NOT NULL,
			applied_at INTEGER NOT NULL
		);
	`);

	const current = getSchemaVersion(db);
	if (current > LATEST_SCHEMA_VERSION) {
		throw new SchemaTooNewError(current, LATEST_SCHEMA_VERSION);
	}

	// Applied versions must be a clean prefix. A gap means a migration row was
	// lost or an applied migration was edited out, and guessing is unsafe.
	const applied = db
		.prepare('SELECT version FROM schema_migrations ORDER BY version ASC')
		.all() as { version: number }[];
	for (let i = 0; i < applied.length; i++) {
		if (applied[i]!.version !== i + 1) {
			throw new Error('Schema migration history has a gap; refusing to continue.');
		}
	}

	const pending = MIGRATIONS.filter((m) => m.version > current);
	if (pending.length === 0) {
		ensureUserVersion(db, current);
		if (current > 0) ensureApplicationId(db);
		return current;
	}

	options.beforeMigrate?.(current, LATEST_SCHEMA_VERSION);

	for (const migration of pending) {
		db.transaction(() => {
			migration.up(db);
			db.prepare('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)').run(
				migration.version,
				migration.name,
				Date.now()
			);
		});
	}

	// `user_version` is a cheap compatibility marker for tools. The real
	// history is `schema_migrations`.
	ensureUserVersion(db, LATEST_SCHEMA_VERSION);
	ensureApplicationId(db);

	return LATEST_SCHEMA_VERSION;
}
