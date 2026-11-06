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

/** Comments can be pinned to the top of their list. */
const commentPins: Migration = {
	version: 2,
	name: 'comment-pins',
	up(db) {
		addColumn(db, 'task_comments', 'pinned', 'INTEGER NOT NULL DEFAULT 0');
		addColumn(db, 'note_comments', 'pinned', 'INTEGER NOT NULL DEFAULT 0');
		addColumn(db, 'principle_comments', 'pinned', 'INTEGER NOT NULL DEFAULT 0');
	}
};

/** Investing boxes: holdings with manual prices plus cached FX rates. */
const holdings: Migration = {
	version: 3,
	name: 'holdings',
	up(db) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS holdings (
				id         TEXT PRIMARY KEY,
				ticker     TEXT NOT NULL,
				amount     REAL NOT NULL DEFAULT 0,
				price      REAL,
				price_auto INTEGER NOT NULL DEFAULT 0,
				currency   TEXT NOT NULL DEFAULT 'USD',
				position   INTEGER NOT NULL DEFAULT 0,
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL
			);
			CREATE TABLE IF NOT EXISTS fx_rates (
				currency    TEXT PRIMARY KEY,
				rate_to_usd REAL NOT NULL,
				fetched_at  INTEGER NOT NULL
			);
		`);
	}
};

/** Holdings goals: per-holding target amounts plus allocation targets. */
const holdingGoals: Migration = {
	version: 4,
	name: 'holding-goals',
	up(db) {
		addColumn(db, 'holdings', 'goal', 'REAL');
		addColumn(db, 'holdings', 'category', "TEXT NOT NULL DEFAULT 'fii'");
		db.exec(`UPDATE holdings SET category = 'btc' WHERE UPPER(ticker) = 'BTC'`);
		db.exec(`
			CREATE TABLE IF NOT EXISTS category_goals (
				category TEXT PRIMARY KEY,
				pct      REAL NOT NULL
			);
		`);
	}
};

/** Cash holdings carry their bank and account country. */
const holdingBank: Migration = {
	version: 5,
	name: 'holding-bank',
	up(db) {
		addColumn(db, 'holdings', 'bank', "TEXT NOT NULL DEFAULT ''");
		addColumn(db, 'holdings', 'country', "TEXT NOT NULL DEFAULT ''");
	}
};

/** When the stored price last came from a quote or a hand edit. */
const holdingPriceTime: Migration = {
	version: 6,
	name: 'holding-price-time',
	up(db) {
		addColumn(db, 'holdings', 'price_updated_at', 'INTEGER NOT NULL DEFAULT 0');
		db.exec('UPDATE holdings SET price_updated_at = updated_at WHERE price IS NOT NULL');
	}
};

/** Buy/sell ledger. The opening row preserves the quantity a holding had
 *  before this table existed; later rows add to or subtract from it. */
const holdingActions: Migration = {
	version: 7,
	name: 'holding-actions',
	up(db) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS holding_actions (
				id         TEXT PRIMARY KEY,
				holding_id TEXT NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
				kind       TEXT NOT NULL,
				amount     REAL NOT NULL,
				price      REAL,
				currency   TEXT NOT NULL DEFAULT 'USD',
				created_at INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS holding_actions_holding
				ON holding_actions(holding_id, created_at DESC);
			INSERT INTO holding_actions (id, holding_id, kind, amount, price, currency, created_at)
				SELECT 'open-' || id, id, 'opening', amount, NULL, currency, created_at FROM holdings;
		`);
	}
};

/** Cash counts at face value, including the backfilled opening rows. */
const holdingActionCash: Migration = {
	version: 8,
	name: 'holding-action-cash',
	up(db) {
		db.exec(`
			UPDATE holding_actions SET price = 1
			WHERE kind = 'opening' AND price IS NULL
				AND holding_id IN (SELECT id FROM holdings WHERE category = 'cash');
		`);
	}
};

/** Absolute value targets are independent from the percent allocation goals,
 *  so they live in their own table and do not affect the sum-to-100 rule. */
const categoryValueGoals: Migration = {
	version: 9,
	name: 'category-value-goals',
	up(db) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS category_value_goals (
				category TEXT PRIMARY KEY,
				amount   REAL NOT NULL,
				currency TEXT NOT NULL
			);
		`);
	}
};

/** Tasks carry an optional YouTube video, like notes and principles. */
const todoVideo: Migration = {
	version: 10,
	name: 'todo-video',
	up(db) {
		addColumn(db, 'todo_items', 'video', "TEXT NOT NULL DEFAULT ''");
	}
};

/** Stock pantry and belongings: consumables tracked by packages × days per
 *  package, durables tracked by purchase, price and end date. Photos stay as
 *  raw bytes in the table; `has_photo` avoids reading the BLOB for lists. */
const stockItems: Migration = {
	version: 11,
	name: 'stock-items',
	up(db) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS stock_items (
				id            TEXT PRIMARY KEY,
				kind          TEXT NOT NULL DEFAULT 'consumable',
				name          TEXT NOT NULL,
				note          TEXT NOT NULL DEFAULT '',
				quantity      REAL NOT NULL DEFAULT 0,
				duration_days REAL NOT NULL DEFAULT 0,
				bought_at     INTEGER,
				price         REAL,
				currency      TEXT NOT NULL DEFAULT 'BRL',
				bought_where  TEXT NOT NULL DEFAULT '',
				ended_at      INTEGER,
				photo         BLOB,
				photo_mime    TEXT NOT NULL DEFAULT '',
				has_photo     INTEGER NOT NULL DEFAULT 0,
				created_at    INTEGER NOT NULL,
				updated_at    INTEGER NOT NULL
			);
		`);
	}
};

/** One row with the consumable coverage target in days (default: one year),
 *  so the list can flag what needs stock. */
const stockGoals: Migration = {
	version: 12,
	name: 'stock-goals',
	up(db) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS stock_goals (
				id          INTEGER PRIMARY KEY CHECK (id = 1),
				target_days INTEGER NOT NULL DEFAULT 365
			);
			INSERT OR IGNORE INTO stock_goals (id, target_days) VALUES (1, 365);
		`);
	}
};

/** Dynamic brand and category registry. One table for both kinds keeps the
 *  form fields identical; `name_key` makes the lookup case-insensitive and
 *  Unicode-normalized, while `name` keeps the display spelling. */
const stockRegistries: Migration = {
	version: 13,
	name: 'stock-registries',
	up(db) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS stock_registries (
				id         TEXT PRIMARY KEY,
				kind       TEXT NOT NULL,
				name       TEXT NOT NULL,
				name_key   TEXT NOT NULL,
				created_at INTEGER NOT NULL,
				UNIQUE (kind, name_key)
			);
		`);
		addColumn(db, 'stock_items', 'brand_id', 'TEXT REFERENCES stock_registries(id) ON DELETE SET NULL');
		addColumn(db, 'stock_items', 'category_id', 'TEXT REFERENCES stock_registries(id) ON DELETE SET NULL');
	}
};

export const MIGRATIONS: Migration[] = [
	baseline,
	commentPins,
	holdings,
	holdingGoals,
	holdingBank,
	holdingPriceTime,
	holdingActions,
	holdingActionCash,
	categoryValueGoals,
	todoVideo,
	stockItems,
	stockGoals,
	stockRegistries
];
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
