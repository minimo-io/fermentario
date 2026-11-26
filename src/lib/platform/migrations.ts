import type { SqlDb } from './sqlite.ts';
import { SCHEMA } from './journal.ts';
import { splitTimeEntryHashtags } from '../hashtags.ts';
import { SLOGAN } from '../brand.ts';

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

/** Optional weight/volume per package. The package count and days per
 *  package still drive the estimate; the size only derives grams/ml totals
 *  and the restock quantity. */
const stockPackageSize: Migration = {
	version: 14,
	name: 'stock-package-size',
	up(db) {
		addColumn(db, 'stock_items', 'package_size', 'REAL NOT NULL DEFAULT 0');
		addColumn(db, 'stock_items', 'package_unit', "TEXT NOT NULL DEFAULT 'g'");
	}
};

/** Multi-photo gallery. Existing single photos become the first gallery row;
 *  the old `stock_items.photo` columns stay for older backups and the
 *  compatibility image route. */
const stockItemPhotos: Migration = {
	version: 15,
	name: 'stock-item-photos',
	up(db) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS stock_item_photos (
				id         TEXT PRIMARY KEY,
				item_id    TEXT NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
				photo      BLOB NOT NULL,
				mime       TEXT NOT NULL,
				position   INTEGER NOT NULL DEFAULT 0,
				created_at INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS stock_item_photos_item
				ON stock_item_photos(item_id, position);
		`);
		db.exec(`
			INSERT INTO stock_item_photos (id, item_id, photo, mime, position, created_at)
			SELECT 'legacy-' || id, id, photo, COALESCE(NULLIF(photo_mime, ''), 'image/jpeg'), 0, updated_at
			FROM stock_items
			WHERE photo IS NOT NULL;
		`);
	}
};

/** Category amount goals. The amount is per person; the list shows
 *  `people × amount` against the summed package sizes. The old one-row
 *  days goal stays for old backups but is no longer used by the UI.
 *  Version 17 widens the unit check so goals use the same units as products
 *  (`g`, `kg`, `ml`, `L`) instead of only grams and litres. */
const stockCategoryGoals: Migration = {
	version: 16,
	name: 'stock-category-goals',
	up(db) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS stock_category_goals (
				category_id TEXT PRIMARY KEY REFERENCES stock_registries(id) ON DELETE CASCADE,
				people      INTEGER NOT NULL DEFAULT 1 CHECK (people >= 1),
				amount      REAL NOT NULL CHECK (amount > 0),
				unit        TEXT NOT NULL DEFAULT 'g' CHECK (unit IN ('g', 'L')),
				note        TEXT NOT NULL DEFAULT ''
			);
		`);
	}
};

/** Same units as products: grams, kilograms, millilitres or litres. The
 *  table is rebuilt because a CHECK constraint cannot be altered in place. */
const stockGoalUnits: Migration = {
	version: 17,
	name: 'stock-goal-units',
	up(db) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS stock_category_goals_new (
				category_id TEXT PRIMARY KEY REFERENCES stock_registries(id) ON DELETE CASCADE,
				people      INTEGER NOT NULL DEFAULT 1 CHECK (people >= 1),
				amount      REAL NOT NULL CHECK (amount > 0),
				unit        TEXT NOT NULL DEFAULT 'g' CHECK (unit IN ('g', 'kg', 'ml', 'L')),
				note        TEXT NOT NULL DEFAULT ''
			);
			INSERT OR IGNORE INTO stock_category_goals_new
				SELECT category_id, people, amount, unit, note FROM stock_category_goals;
			DROP TABLE stock_category_goals;
			ALTER TABLE stock_category_goals_new RENAME TO stock_category_goals;
		`);
	}
};

/** Logged consumptions per item. `stock_item_actions` arrives with
 *  migration 18; the table is rebuilt on every flag flip, so old backups
 *  restore without history. */
const stockItemActions: Migration = {
	version: 18,
	name: 'stock-item-actions',
	up(db) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS stock_item_actions (
				id         TEXT PRIMARY KEY,
				item_id    TEXT NOT NULL REFERENCES stock_items(id) ON DELETE CASCADE,
				kind       TEXT NOT NULL DEFAULT 'consume' CHECK (kind IN ('consume')),
				amount     REAL NOT NULL CHECK (amount > 0),
				unit       TEXT NOT NULL DEFAULT 'g',
				packages   REAL NOT NULL DEFAULT 0,
				note       TEXT NOT NULL DEFAULT '',
				created_at INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS stock_item_actions_item
				ON stock_item_actions(item_id, created_at DESC, id DESC);
		`);
	}
};

/** Category parent groups (nodes hierarchy). `parent` is a plain label
 *  (e.g. Food, Fun) on category rows; items inherit it by category. */
const stockRegistryParents: Migration = {
	version: 19,
	name: 'stock-registry-parents',
	up(db) {
		addColumn(db, 'stock_registries', 'parent', "TEXT NOT NULL DEFAULT ''");
	}
};

/** Optional expiration date for consumables. Existing rows stay NULL. */
const stockExpiresAt: Migration = {
	version: 20,
	name: 'stock-expires-at',
	up(db) {
		addColumn(db, 'stock_items', 'expires_at', 'INTEGER');
	}
};

/** Daily value snapshots: one row per holding per day and one portfolio
 *  total per day. Later fetches upsert the same day, so each day keeps the
 *  last value seen. `previous_value` on holdings powers the card delta. */
const holdingValueHistory: Migration = {
	version: 21,
	name: 'holding-value-history',
	up(db) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS holding_value_history (
				holding_id  TEXT NOT NULL REFERENCES holdings(id) ON DELETE CASCADE,
				day         TEXT NOT NULL,
				amount      REAL NOT NULL DEFAULT 0,
				price       REAL,
				value       REAL NOT NULL DEFAULT 0,
				currency    TEXT NOT NULL DEFAULT 'USD',
				value_usd   REAL NOT NULL DEFAULT 0,
				recorded_at INTEGER NOT NULL,
				PRIMARY KEY (holding_id, day)
			);
			CREATE INDEX IF NOT EXISTS holding_value_history_day
				ON holding_value_history(day);
			CREATE TABLE IF NOT EXISTS portfolio_value_history (
				day         TEXT PRIMARY KEY,
				value_usd   REAL NOT NULL DEFAULT 0,
				recorded_at INTEGER NOT NULL
			);
		`);
		addColumn(db, 'holdings', 'previous_value', 'REAL');
		addColumn(db, 'holdings', 'previous_value_at', 'INTEGER NOT NULL DEFAULT 0');
	}
};

/** Manual shopping-list extras. One row per current item; deleting a row
 *  leaves no history. */
const shoppingExtras: Migration = {
	version: 22,
	name: 'shopping-extras',
	up(db) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS shopping_extras (
				id         TEXT PRIMARY KEY,
				text       TEXT NOT NULL,
				position   INTEGER NOT NULL DEFAULT 0,
				created_at INTEGER NOT NULL
			);
		`);
	}
};

/** Swing-trading panel. Orders are raw events; positions and the monthly
 *  panel derive from them, so future features attach without rewrites.
 *  `trading_orgs` holds each venue and its editable cost rules. */
const trading: Migration = {
	version: 23,
	name: 'trading',
	up(db) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS trading_orgs (
				id            TEXT PRIMARY KEY,
				name          TEXT NOT NULL,
				enabled       INTEGER NOT NULL DEFAULT 1,
				fee_rate      REAL NOT NULL DEFAULT 0.0003,
				irrf_rate     REAL NOT NULL DEFAULT 0.00005,
				fixed_fee     REAL NOT NULL DEFAULT 0,
				exempt_limit  REAL NOT NULL DEFAULT 20000,
				position      INTEGER NOT NULL DEFAULT 0,
				created_at    INTEGER NOT NULL
			);
			CREATE TABLE IF NOT EXISTS trading_orders (
				id         TEXT PRIMARY KEY,
				org_id     TEXT NOT NULL REFERENCES trading_orgs(id) ON DELETE CASCADE,
				ticker     TEXT NOT NULL,
				side       TEXT NOT NULL,
				qty        REAL NOT NULL,
				unit_price REAL NOT NULL,
				value      REAL NOT NULL,
				fees       REAL NOT NULL DEFAULT 0,
				irrf       REAL NOT NULL DEFAULT 0,
				net        REAL NOT NULL,
				date       INTEGER NOT NULL,
				month      TEXT NOT NULL,
				created_at INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS trading_orders_org_date
				ON trading_orders(org_id, date);
			CREATE TABLE IF NOT EXISTS trading_targets (
				org_id     TEXT NOT NULL REFERENCES trading_orgs(id) ON DELETE CASCADE,
				ticker     TEXT NOT NULL,
				target_pct REAL NOT NULL DEFAULT 0.03,
				updated_at INTEGER NOT NULL,
				PRIMARY KEY (org_id, ticker)
			);
			CREATE TABLE IF NOT EXISTS trading_quotes (
				ticker         TEXT PRIMARY KEY,
				price          REAL NOT NULL,
				previous_close REAL,
				source         TEXT NOT NULL DEFAULT '',
				fetched_at     INTEGER NOT NULL
			);
			CREATE TABLE IF NOT EXISTS quote_fetch_log (
				id             TEXT PRIMARY KEY,
				ticker         TEXT NOT NULL,
				source         TEXT NOT NULL,
				ok             INTEGER NOT NULL DEFAULT 0,
				price          REAL,
				previous_close REAL,
				error          TEXT NOT NULL DEFAULT '',
				fetched_at     INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS quote_fetch_log_time
				ON quote_fetch_log(fetched_at DESC);
		`);
		const now = Date.now();
		const seed = db.prepare(
			'INSERT OR IGNORE INTO trading_orgs (id, name, enabled, fee_rate, irrf_rate, fixed_fee, exempt_limit, position, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
		);
		seed.run('b3', 'B3', 1, 0.0003, 0.00005, 0, 20000, 0, now);
		seed.run('ripio', 'Ripio', 0, 0, 0, 0, 0, 1, now);
	}
};

/** B3 ticker universe for the order picker. Seeds are the liquid names;
 *  custom rows are user additions a future admin UI will manage. */
const b3Tickers: Migration = {
	version: 24,
	name: 'b3-tickers',
	up(db) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS b3_tickers (
				ticker     TEXT PRIMARY KEY,
				source     TEXT NOT NULL DEFAULT 'seed',
				created_at INTEGER NOT NULL
			);
		`);
		const now = Date.now();
		const seed = db.prepare(
			"INSERT OR IGNORE INTO b3_tickers (ticker, source, created_at) VALUES (?, 'seed', ?)"
		);
		for (const t of [
			'ABEV3', 'ALOS3', 'ALPA4', 'ASAI3', 'AURE3', 'AZUL4', 'B3SA3', 'BBAS3',
			'BBDC3', 'BBDC4', 'BBSE3', 'BEEF3', 'BPAC11', 'BRAP4', 'BRAVA3', 'BRFS3',
			'CMIG4', 'COGN3', 'CPFE3', 'CPLE6', 'CSAN3', 'CSNA3', 'CVCB3', 'CYRE3',
			'DXCO3', 'EGIE3', 'ELET3', 'ELET6', 'EMBR3', 'ENEV3', 'EQTL3', 'EZTC3',
			'FLRY3', 'GGBR3', 'GGBR4', 'GMAT3', 'GOAU4', 'GOLL4', 'HAPV3', 'HYPE3',
			'IGTI11', 'ITSA4', 'ITUB4', 'JBSS3', 'JHSF3', 'KLBN11', 'LREN3', 'LWSA3',
			'MGLU3', 'MRFG3', 'MRVE3', 'MULT3', 'NTCO3', 'PCAR3', 'PETR3', 'PETR4',
			'PETZ3', 'PRIO3', 'PSSA3', 'RADL3', 'RAIL3', 'RDOR3', 'RECV3', 'RENT3',
			'SANB11', 'SBSP3', 'SLCE3', 'SMFT3', 'STBP3', 'SUZB3', 'TAEE11', 'TIMS3',
			'TOTS3', 'UGPA3', 'USIM5', 'VALE3', 'VAMO3', 'VBBR3', 'VIVA3', 'VIVT3', 'WEGE3',
			'YDUQ3',
			'ALZR11', 'BCRI11', 'BRCR11', 'BTLG11', 'CACR11', 'CPTS11', 'CVBI11',
			'DEVA11', 'FOFT11', 'GARE11', 'GGRC11', 'HGFF11', 'HGLG11', 'HGRE11',
			'HGRU11', 'HFOF11', 'IRDM11', 'JSRE11', 'KFOF11', 'KNCR11', 'KNIP11',
			'KNSC11', 'KNRI11', 'LVBI11', 'MCCI11', 'MXRF11', 'NCHB11', 'OUJP11',
			'PLCR11', 'PVBI11', 'RBRF11', 'RBRP11', 'RCRB11', 'RECR11', 'RZTR11',
			'SNEL11', 'TGAR11', 'TRXF11', 'VGIR11', 'VILG11', 'VISC11', 'XPML11',
			'XPLG11'
		]) {
			seed.run(t, now);
		}
	}
};

/** One stored quote per ticker per day: the position's own series. */
const tradingQuoteHistory: Migration = {
	version: 25,
	name: 'trading-quote-history',
	up(db) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS trading_quote_history (
				ticker     TEXT NOT NULL,
				day        TEXT NOT NULL,
				price      REAL NOT NULL,
				source     TEXT NOT NULL DEFAULT '',
				recorded_at INTEGER NOT NULL,
				PRIMARY KEY (ticker, day)
			);
		`);
	}
};

/** Notes can be published to the public homepage. */
const notePublished: Migration = {
	version: 26,
	name: 'note-published',
	up(db) {
		addColumn(db, 'notes', 'published', 'INTEGER NOT NULL DEFAULT 0');
		db.exec('CREATE INDEX IF NOT EXISTS idx_notes_published ON notes (published, created_at DESC, id DESC)');
	}
};

/** One cover photo per note for published articles. */
const noteCoverPhotos: Migration = {
	version: 27,
	name: 'note-cover-photos',
	up(db) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS note_photos (
				id         TEXT PRIMARY KEY,
				note_id    TEXT NOT NULL REFERENCES notes(id) ON DELETE CASCADE,
				photo      BLOB NOT NULL,
				mime       TEXT NOT NULL DEFAULT 'image/jpeg',
				created_at INTEGER NOT NULL
			);
			CREATE UNIQUE INDEX IF NOT EXISTS idx_note_photos_note ON note_photos (note_id);
		`);
	}
};

/** Public presentation settings. This row is safe to expose to anonymous
 *  visitors; private admin preferences stay outside it. */
const publicConfig: Migration = {
	version: 28,
	name: 'public-config',
	up(db) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS public_config (
				id                INTEGER PRIMARY KEY CHECK (id = 1),
				site_title        TEXT    NOT NULL DEFAULT 'fermentario',
				description       TEXT    NOT NULL DEFAULT 'Published notes.',
				notes_enabled     INTEGER NOT NULL DEFAULT 1,
				show_cover_images INTEGER NOT NULL DEFAULT 1,
				updated_at        INTEGER NOT NULL DEFAULT 0
			);
			INSERT OR IGNORE INTO public_config (
				id, site_title, description, notes_enabled, show_cover_images, updated_at
			) VALUES (1, 'fermentario', 'Published notes.', 1, 1, 0);
		`);
	}
};

/** The Library: EPUB bytes live in the journal, so backups and restore carry
 *  the books themselves, not just their metadata. */
const libraryBooks: Migration = {
	version: 29,
	name: 'library-books',
	up(db) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS books (
				id           TEXT PRIMARY KEY,
				title        TEXT NOT NULL,
				author       TEXT NOT NULL DEFAULT '',
				bytes        BLOB NOT NULL,
				size         INTEGER NOT NULL,
				added_at     INTEGER NOT NULL,
				last_cfi     TEXT NOT NULL DEFAULT '',
				last_pct     REAL NOT NULL DEFAULT 0,
				last_chapter TEXT NOT NULL DEFAULT '',
				last_read_at INTEGER NOT NULL DEFAULT 0
			);
			CREATE TABLE IF NOT EXISTS book_notes (
				id         TEXT PRIMARY KEY,
				book_id    TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
				cfi        TEXT NOT NULL,
				excerpt    TEXT NOT NULL DEFAULT '',
				note       TEXT NOT NULL DEFAULT '',
				color      TEXT NOT NULL DEFAULT 'amber',
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_books_last_read ON books (last_read_at DESC, added_at DESC, id DESC);
			CREATE INDEX IF NOT EXISTS idx_book_notes_book ON book_notes (book_id, created_at DESC);
		`);
	}
};

/** Service API credentials (Ripio Trade today). They live in the journal
 *  DB because the journal is the app's whole state: backups carry them and
 *  a restore re-arms the integration. No other code path reads them out —
 *  the admin API reports only configured/updatedAt. */
const apiCredentials: Migration = {
	version: 30,
	name: 'api-credentials',
	up(db) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS api_credentials (
				service    TEXT PRIMARY KEY,
				token      TEXT NOT NULL,
				secret     TEXT NOT NULL,
				updated_at INTEGER NOT NULL
			);
		`);
	}
};

/** Nostr profile (nsec stays in the journal, local-first) and the events
 *  published from it. The relay list is cached here (NIP-65) so publishing
 *  works offline against the last-known set. */
const nostrProfile: Migration = {
	version: 31,
	name: 'nostr-profile',
	up(db) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS nostr_profile (
				id        INTEGER PRIMARY KEY CHECK (id = 1),
				nsec      TEXT NOT NULL DEFAULT '',
				npub      TEXT NOT NULL DEFAULT '',
				name      TEXT NOT NULL DEFAULT '',
				about     TEXT NOT NULL DEFAULT '',
				picture   TEXT NOT NULL DEFAULT '',
				relays    TEXT NOT NULL DEFAULT '[]',
				updated_at INTEGER NOT NULL DEFAULT 0
			);
			INSERT OR IGNORE INTO nostr_profile (id) VALUES (1);
			CREATE TABLE IF NOT EXISTS nostr_events (
				id          TEXT PRIMARY KEY,
				account_id  TEXT NOT NULL DEFAULT '',
				kind        INTEGER NOT NULL,
				content     TEXT NOT NULL DEFAULT '',
				tags        TEXT NOT NULL DEFAULT '[]',
				created_at  INTEGER NOT NULL,
				published_at INTEGER NOT NULL,
				source_note_id TEXT,
				is_reply    INTEGER NOT NULL DEFAULT 0,
				raw_event   TEXT NOT NULL DEFAULT ''
			);
			CREATE INDEX IF NOT EXISTS idx_nostr_events_created ON nostr_events (created_at DESC, id DESC);
			CREATE INDEX IF NOT EXISTS idx_nostr_events_reply ON nostr_events (is_reply, created_at DESC);
		`);
	}
};

/** The embedded relay serves and filters by author, so the stored events need
 *  their pubkey as a column. Backfill from the raw event JSON. */
const nostrEventPubkey: Migration = {
	version: 32,
	name: 'nostr-event-pubkey',
	up(db) {
		db.exec(`
			ALTER TABLE nostr_events ADD COLUMN pubkey TEXT NOT NULL DEFAULT '';
			CREATE INDEX IF NOT EXISTS idx_nostr_events_pubkey ON nostr_events (pubkey, kind, created_at DESC);
			UPDATE nostr_events
				SET pubkey = COALESCE(json_extract(raw_event, '$.pubkey'), '')
				WHERE pubkey = '';
		`);
	}
};

/** Manual time tracking: one running entry at a time, with history. */
const timeTracker: Migration = {
	version: 33,
	name: 'time-tracker',
	up(db) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS time_entries (
				id         TEXT PRIMARY KEY,
				comment    TEXT NOT NULL DEFAULT '',
				started_at INTEGER NOT NULL,
				ended_at   INTEGER,
				created_at INTEGER NOT NULL,
				updated_at INTEGER NOT NULL
			);
			CREATE INDEX IF NOT EXISTS time_entries_state
				ON time_entries(ended_at, started_at DESC);
		`);
	}
};

/** Project/tag association for time entries. */
/** A venue spread is not a tax: Ripio fills a sale at the bid, below the
 *  price the card shows. It joins the sell-side cost of the projection. */
const tradingSpread: Migration = {
	version: 35,
	name: 'trading-spread',
	up(db) {
		db.exec('ALTER TABLE trading_orgs ADD COLUMN spread_rate REAL NOT NULL DEFAULT 0;');
	}
};

/** Ripio charges one percentage per operation, with a free comment the
 *  user writes. The spread and the fixed fee made its maths noisy, so the
 *  venue keeps a single fee. B3 rows are untouched. */
const tradingFeeNote: Migration = {
	version: 36,
	name: 'trading-fee-note',
	up(db) {
		db.exec("ALTER TABLE trading_orgs ADD COLUMN fee_note TEXT NOT NULL DEFAULT '';");
		db.exec("UPDATE trading_orgs SET spread_rate = 0, fixed_fee = 0 WHERE id = 'ripio'");
	}
};

/** Every order keeps the cost rules it was recorded with. A later fee edit
 *  belongs to future orders only: the stored money, the edit sheet and the
 *  goal price of an open position all read these columns. The backfill uses
 *  today's venue rules; rows recorded before this migration keep the money
 *  they already stored. */
const tradingOrderCosts: Migration = {
	version: 37,
	name: 'trading-order-costs',
	up(db) {
		db.exec('ALTER TABLE trading_orders ADD COLUMN fee_rate REAL NOT NULL DEFAULT 0;');
		db.exec('ALTER TABLE trading_orders ADD COLUMN spread_rate REAL NOT NULL DEFAULT 0;');
		db.exec('ALTER TABLE trading_orders ADD COLUMN irrf_rate REAL NOT NULL DEFAULT 0;');
		db.exec('ALTER TABLE trading_orders ADD COLUMN fixed_fee REAL NOT NULL DEFAULT 0;');
		db.exec(`UPDATE trading_orders SET
			fee_rate = COALESCE((SELECT o.fee_rate FROM trading_orgs o WHERE o.id = trading_orders.org_id), 0),
			spread_rate = COALESCE((SELECT o.spread_rate FROM trading_orgs o WHERE o.id = trading_orders.org_id), 0),
			irrf_rate = COALESCE((SELECT o.irrf_rate FROM trading_orgs o WHERE o.id = trading_orders.org_id), 0),
			fixed_fee = COALESCE((SELECT o.fixed_fee FROM trading_orgs o WHERE o.id = trading_orders.org_id), 0)`);
	}
};

const timeEntryTags: Migration = {
	version: 34,
	name: 'time-entry-tags',
	up(db) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS time_entry_tags (
				entry_id TEXT NOT NULL REFERENCES time_entries(id) ON DELETE CASCADE,
				tag      TEXT NOT NULL,
				PRIMARY KEY (entry_id, tag)
			);
			CREATE INDEX IF NOT EXISTS time_entry_tags_tag ON time_entry_tags(tag);
		`);
	}
};

/** Older time entries could start with the hashtag run (`#cubiq deep work`).
 *  The parser ignored it, so those entries had no tag rows and never reached
 *  the tag pages. Read the leading run once and make the stored form the same
 *  as a fresh start: text without the run, tags in `time_entry_tags`. */
const timeEntryLeadingTags: Migration = {
	version: 38,
	name: 'time-entry-leading-tags',
	up(db) {
		const rows = db
			.prepare("SELECT id, comment FROM time_entries WHERE comment LIKE '#%'")
			.all() as { id: string; comment: string }[];
		const hasTag = db.prepare('SELECT 1 AS ok FROM time_entry_tags WHERE entry_id = ? LIMIT 1');
		const insert = db.prepare('INSERT OR IGNORE INTO time_entry_tags (entry_id, tag) VALUES (?, ?)');
		const update = db.prepare('UPDATE time_entries SET comment = ? WHERE id = ?');
		db.transaction(() => {
			for (const row of rows) {
				if (hasTag.get(row.id)) continue;
				const split = splitTimeEntryHashtags(row.comment);
				if (split.tags.length === 0) continue;
				for (const tag of split.tags) insert.run(row.id, tag);
				update.run(split.content, row.id);
			}
		});
	}
};

/** One scratch note per journal, owned by the quick note mini app. It is not a
 *  `notes` row on purpose: it must stay out of the timeline, tags, search and
 *  publishing. */
const quickNote: Migration = {
	version: 39,
	name: 'quick-note',
	up(db) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS quick_note (
				id         INTEGER PRIMARY KEY CHECK (id = 1),
				content    TEXT NOT NULL DEFAULT '',
				updated_at INTEGER NOT NULL DEFAULT 0
			);
			INSERT OR IGNORE INTO quick_note (id, content, updated_at) VALUES (1, '', 0);
		`);
	}
};

/** The public description doubles as the slogan. Keep any text the user wrote
 *  and replace only the old placeholder. */
const publicSlogan: Migration = {
	version: 40,
	name: 'public-slogan',
	up(db) {
		db.prepare('UPDATE public_config SET description = ? WHERE description = ?').run(
			SLOGAN,
			'Published notes.'
		);
	}
};

/** Optional note titles. An empty string means the note has none. */
const noteTitle: Migration = {
	version: 41,
	name: 'note-title',
	up(db) {
		const noteColumns = columns(db, 'notes');
		if (!noteColumns.has('title')) {
			db.exec("ALTER TABLE notes ADD COLUMN title TEXT NOT NULL DEFAULT ''");
		}
	}
};

/** One image per to-do item, chosen in the New task form. */
const todoItemPhotos: Migration = {
	version: 42,
	name: 'todo-item-photos',
	up(db) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS todo_item_photos (
				id         TEXT PRIMARY KEY,
				item_id    TEXT NOT NULL REFERENCES todo_items(id) ON DELETE CASCADE,
				photo      BLOB NOT NULL,
				mime       TEXT NOT NULL DEFAULT 'image/jpeg',
				created_at INTEGER NOT NULL
			);
			CREATE UNIQUE INDEX IF NOT EXISTS idx_todo_item_photos_item ON todo_item_photos (item_id);
		`);
	}
};

/** Private admin presentation settings. The motivation card is admin-only
 *  text: it stays out of `public_config`, which anonymous visitors can read. */
const adminConfig: Migration = {
	version: 43,
	name: 'admin-config',
	up(db) {
		db.exec(`
			CREATE TABLE IF NOT EXISTS admin_config (
				id         INTEGER PRIMARY KEY CHECK (id = 1),
				motto      TEXT    NOT NULL DEFAULT '',
				updated_at INTEGER NOT NULL DEFAULT 0
			);
			INSERT OR IGNORE INTO admin_config (id, motto, updated_at) VALUES (1, '', 0);
		`);
	}
};

/** Remove the retired Quick note scratchpad and its saved text. */
const removeQuickNote: Migration = {
	version: 44,
	name: 'remove-quick-note',
	up(db) {
		db.exec('DROP TABLE IF EXISTS quick_note');
	}
};

/** Remove AI embeddings, recap cache and saved Ask history. */
const removeAiData: Migration = {
	version: 45,
	name: 'remove-ai-data',
	up(db) {
		db.exec(`
			DROP TABLE IF EXISTS note_vectors;
			DROP TABLE IF EXISTS weekly_recaps;
			DROP TABLE IF EXISTS ask_history;
		`);
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
	stockRegistries,
	stockPackageSize,
	stockItemPhotos,
	stockCategoryGoals,
	stockGoalUnits,
	stockItemActions,
	stockRegistryParents,
	stockExpiresAt,
	holdingValueHistory,
	shoppingExtras,
	trading,
	b3Tickers,
	tradingQuoteHistory,
	notePublished,
	noteCoverPhotos,
	publicConfig,
	libraryBooks,
	apiCredentials,
	nostrProfile,
	nostrEventPubkey,
	timeTracker,
	timeEntryTags,
	tradingSpread,
	tradingFeeNote,
	tradingOrderCosts,
	timeEntryLeadingTags,
	quickNote,
	publicSlogan,
	noteTitle,
	todoItemPhotos,
	adminConfig,
	removeQuickNote,
	removeAiData
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
