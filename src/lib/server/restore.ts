import Database from 'better-sqlite3';
import { writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { LATEST_SCHEMA_VERSION } from '$lib/platform/migrations';
import type { SqlDb } from '$lib/platform/sqlite';
import { DATA_DIR } from './journal-registry';

/**
 * Shared database restore core.
 *
 * `POST /api/import` uses it against the active journal. The onboarding route
 * uses it against a fresh journal scaffold, so both paths validate and copy the
 * same tables. The live database is never swapped on disk: the uploaded file is
 * attached and copied through the target connection in one transaction.
 */

export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

// Every export contains these tables. Newer tables are optional so a backup
// written before To-Do lists, principles or tag colors still restores.
export const REQUIRED_TABLES = ['notes', 'note_tags', 'weekly_recaps', 'ask_history'] as const;

const TEMP_SUFFIXES = ['', '-shm', '-wal', '-journal'];

export type RestoreSend = (data: unknown) => void;

export interface RestoreUpload {
	tempPath: string;
	source: Database.Database;
	found: Set<string>;
	version: number;
}

export interface RestoreCounts {
	notes: number;
	tags: number;
	recaps: number;
	asks: number;
	todoGroups: number;
	todoItems: number;
	principles: number;
	holdings: number;
	goals: number;
	valueGoals: number;
	stocks: number;
	stockGoal: number;
	stockActions: number;
	holdingValueHistory: number;
	portfolioValueHistory: number;
	shoppingExtras: number;
	tradingOrgs: number;
	tradingOrders: number;
	b3Tickers: number;
}

function sqlString(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

function count(db: SqlDb, table: string): number {
	return (db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get<{ c: number }>()?.c ?? 0) as number;
}

/**
 * Write the upload to a temporary file and validate it. The returned source
 * handle stays open for column inspection while the rows are copied.
 */
export async function readAndValidateUpload(
	request: Request,
	send: RestoreSend
): Promise<RestoreUpload> {
	let tempPath: string | null = null;
	let source: Database.Database | null = null;

	try {
		send({ phase: 'uploading' });
		const form = await request.formData();
		const file = form.get('file');
		if (!(file instanceof File) || file.size === 0) {
			throw new Error('Choose a database file to restore.');
		}
		if (file.size > MAX_UPLOAD_BYTES) {
			throw new Error('That file is larger than 100 MB.');
		}

		tempPath = resolve(DATA_DIR, `import-${randomUUID()}.db`);
		await writeFile(tempPath, Buffer.from(await file.arrayBuffer()));

		send({ phase: 'validating' });
		const uploaded = new Database(tempPath, { readonly: true, fileMustExist: true });
		source = uploaded;

		// SQLite opens files lazily, so a text file or a truncated database only
		// fails on the first read.
		const check = uploaded.pragma('quick_check', { simple: true }) as string;
		if (check !== 'ok') throw new Error('that database is damaged');

		const found = new Set(
			(
				uploaded
					.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
					.all() as { name: string }[]
			).map((row) => row.name)
		);
		const missing = REQUIRED_TABLES.filter((table) => !found.has(table));
		if (missing.length > 0) {
			throw new Error(`not a fermentario database (missing ${missing.join(', ')})`);
		}

		let version = 0;
		if (found.has('schema_migrations')) {
			const row = uploaded
				.prepare('SELECT MAX(version) AS version FROM schema_migrations')
				.get() as { version: number | null } | undefined;
			version = row?.version ?? 0;
		} else {
			version = Number(uploaded.pragma('user_version', { simple: true }) ?? 0);
		}
		if (version > LATEST_SCHEMA_VERSION) {
			throw new Error(
				`this backup is schema version ${version}; this app supports version ${LATEST_SCHEMA_VERSION}. Update the app first`
			);
		}

		return { tempPath, source: uploaded, found, version };
	} catch (err) {
		try {
			source?.close();
		} catch {
			// Already closed.
		}
		if (tempPath) await cleanupUploadFile(tempPath);
		throw err;
	}
}

/** Copy the validated upload into an already-migrated target database. */
export function copyUploadIntoTarget(
	target: SqlDb,
	upload: RestoreUpload,
	send: RestoreSend
): RestoreCounts {
	const found = upload.found;
	const has = (table: string) => found.has(table);
	const columnCache = new Map<string, Set<string>>();
	const columns = (table: string) => {
		let known = columnCache.get(table);
		if (!known) {
			known = new Set(
				(upload.source.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
					(row) => row.name
				)
			);
			columnCache.set(table, known);
		}
		return known;
	};
	// Old exports lack columns added by later migrations. Select a literal
	// default instead of failing the whole restore.
	const column = (table: string, name: string, fallback: string) =>
		columns(table).has(name) ? name : fallback;
	const hasTodo = has('todo_groups') && has('todo_items');

	target.exec(`ATTACH DATABASE ${sqlString(upload.tempPath)} AS backup`);
	try {
		target.exec('BEGIN IMMEDIATE');

		send({ phase: 'replacing' });
		// Children cascade from their parents (foreign_keys = ON): notes owns
		// tags/vectors/comments, todo_items owns task comments and tags,
		// principles owns tags and comments. notes_fts is virtual with no
		// foreign key, so it is emptied explicitly.
		const statements: string[] = [
			'DELETE FROM notes',
			'DELETE FROM notes_fts',
			'DELETE FROM weekly_recaps',
			'DELETE FROM ask_history',
			'DELETE FROM shopping_extras',
			// The target is already migrated to the latest schema, so the
			// stock tables always exist. Clear them even when the backup is
			// older than them; a replace must not leave rows behind.
			'DELETE FROM stock_item_photos',
			'DELETE FROM stock_item_actions',
			'DELETE FROM stock_category_goals',
			'DELETE FROM stock_items',
			'DELETE FROM stock_registries',
			'DELETE FROM stock_goals',
			'DELETE FROM trading_orders',
			'DELETE FROM trading_targets',
			'DELETE FROM trading_quotes',
			'DELETE FROM trading_orgs',
			'DELETE FROM quote_fetch_log',
		];
		if (has('b3_tickers')) statements.push('DELETE FROM b3_tickers');
		if (hasTodo) statements.push('DELETE FROM todo_items', 'DELETE FROM todo_groups');
		if (has('principles')) statements.push('DELETE FROM principles');
		if (has('tag_colors')) statements.push('DELETE FROM tag_colors');
		if (has('holdings')) statements.push('DELETE FROM holding_value_history', 'DELETE FROM portfolio_value_history', 'DELETE FROM holding_actions', 'DELETE FROM holdings', 'DELETE FROM fx_rates', 'DELETE FROM category_goals', 'DELETE FROM category_value_goals');

		statements.push(
			`INSERT INTO notes (id, content, created_at, updated_at, featured, video)
				SELECT id, content, created_at, updated_at,
					${column('notes', 'featured', '0')}, ${column('notes', 'video', "''")}
				FROM backup.notes`,
			'INSERT INTO note_tags (note_id, tag) SELECT note_id, tag FROM backup.note_tags',
			`INSERT INTO weekly_recaps (week_key, content, created_at, updated_at)
				SELECT week_key, content, created_at, updated_at FROM backup.weekly_recaps`,
			`INSERT INTO ask_history (id, question, answer, sources, created_at)
				SELECT id, question, answer, sources, created_at FROM backup.ask_history`
		);
		if (has('note_vectors')) {
			statements.push(
				'INSERT INTO note_vectors (note_id, vector) SELECT note_id, vector FROM backup.note_vectors'
			);
		}
		if (has('note_comments')) {
			statements.push(
				`INSERT INTO note_comments (id, note_id, content, created_at, pinned)
					SELECT id, note_id, content, created_at, ${column('note_comments', 'pinned', '0')}
					FROM backup.note_comments`
			);
		}
		if (hasTodo) {
			statements.push(
				`INSERT INTO todo_groups (id, name, position, created_at)
					SELECT id, name, ${column('todo_groups', 'position', '0')}, created_at
					FROM backup.todo_groups`,
				`INSERT INTO todo_items (id, group_id, content, done, done_at, in_progress, subgroup, video, position, created_at, updated_at)
					SELECT id, group_id, content, done,
						${column('todo_items', 'done_at', '0')},
						${column('todo_items', 'in_progress', '0')},
						${column('todo_items', 'subgroup', "''")},
						${column('todo_items', 'video', "''")},
						${column('todo_items', 'position', '0')},
						created_at, updated_at
					FROM backup.todo_items`
			);
			if (has('todo_item_tags')) {
				statements.push(
					`INSERT INTO todo_item_tags (item_id, tag)
						SELECT item_id, tag FROM backup.todo_item_tags`
				);
			}
			if (has('task_comments')) {
				statements.push(
					`INSERT INTO task_comments (id, item_id, content, created_at, pinned)
						SELECT id, item_id, content, created_at, ${column('task_comments', 'pinned', '0')}
						FROM backup.task_comments`
				);
			}
		}
		if (has('principles')) {
			statements.push(
				`INSERT INTO principles (id, content, position, created_at, video)
					SELECT id, content, ${column('principles', 'position', '0')}, created_at,
						${column('principles', 'video', "''")}
					FROM backup.principles`
			);
			if (has('principle_tags')) {
				statements.push(
					`INSERT INTO principle_tags (principle_id, tag)
						SELECT principle_id, tag FROM backup.principle_tags`
				);
			}
			if (has('principle_comments')) {
				statements.push(
					`INSERT INTO principle_comments (id, principle_id, content, created_at, pinned)
						SELECT id, principle_id, content, created_at, ${column('principle_comments', 'pinned', '0')}
						FROM backup.principle_comments`
				);
			}
		}
		if (has('tag_colors')) {
			statements.push(
				'INSERT INTO tag_colors (tag, color) SELECT tag, color FROM backup.tag_colors'
			);
		}
		if (has('holdings')) {
			statements.push(
				`INSERT INTO holdings (id, ticker, amount, price, price_auto, currency, category, goal, bank, country, position, created_at, updated_at, price_updated_at, previous_value, previous_value_at)
					SELECT id, ticker, amount, ${column('holdings', 'price', 'NULL')},
						${column('holdings', 'price_auto', '0')}, ${column('holdings', 'currency', "'USD'")},
						${column('holdings', 'category', "'fii'")}, ${column('holdings', 'goal', 'NULL')},
						${column('holdings', 'bank', "''")}, ${column('holdings', 'country', "''")},
						${column('holdings', 'position', '0')}, created_at, updated_at,
						${column('holdings', 'price_updated_at', 'updated_at')},
						${column('holdings', 'previous_value', 'NULL')},
						${column('holdings', 'previous_value_at', '0')}
					FROM backup.holdings`
			);
		}
		if (has('holdings') && has('holding_actions')) {
			statements.push(
				`INSERT INTO holding_actions (id, holding_id, kind, amount, price, currency, created_at)
					SELECT id, holding_id, kind, amount,
						${column('holding_actions', 'price', 'NULL')},
						${column('holding_actions', 'currency', "'USD'")}, created_at
					FROM backup.holding_actions`
			);
		} else if (has('holdings')) {
			// Older backups have no ledger: the copied amount becomes the
			// opening row, with no average cost. Cash still counts at face value.
			statements.push(
				`INSERT INTO holding_actions (id, holding_id, kind, amount, price, currency, created_at)
					SELECT 'open-' || id, id, 'opening', amount,
						CASE WHEN category = 'cash' THEN 1 ELSE NULL END, currency, created_at
					FROM holdings`
			);
		}
		if (has('holding_value_history') && has('holdings')) {
			statements.push(
				`INSERT INTO holding_value_history (holding_id, day, amount, price, value, currency, value_usd, recorded_at)
					SELECT holding_id, day,
						${column('holding_value_history', 'amount', '0')},
						${column('holding_value_history', 'price', 'NULL')},
						${column('holding_value_history', 'value', '0')},
						${column('holding_value_history', 'currency', "'USD'")},
						${column('holding_value_history', 'value_usd', '0')},
						recorded_at
					FROM backup.holding_value_history`
			);
		}
		if (has('portfolio_value_history')) {
			statements.push(
				`INSERT INTO portfolio_value_history (day, value_usd, recorded_at)
					SELECT day, ${column('portfolio_value_history', 'value_usd', '0')}, recorded_at
					FROM backup.portfolio_value_history`
			);
		}
		if (has('holdings')) {
			// Exports made before migration 8 carry a NULL opening price for
			// cash; normalize it so the restored ledger matches a fresh one.
			statements.push(
				`UPDATE holding_actions SET price = 1
				WHERE kind = 'opening' AND price IS NULL
					AND holding_id IN (SELECT id FROM holdings WHERE category = 'cash')`
			);
		}
		if (has('fx_rates')) {
			statements.push(
				'INSERT INTO fx_rates (currency, rate_to_usd, fetched_at) SELECT currency, rate_to_usd, fetched_at FROM backup.fx_rates'
			);
		}
		if (has('category_goals')) {
			statements.push(
				'INSERT INTO category_goals (category, pct) SELECT category, pct FROM backup.category_goals'
			);
		}
		if (has('category_value_goals')) {
			statements.push(
				`INSERT INTO category_value_goals (category, amount, currency)
					SELECT category, ${column('category_value_goals', 'amount', '0')},
						${column('category_value_goals', 'currency', "'BRL'")}
					FROM backup.category_value_goals`
			);
		}
		if (has('shopping_extras')) {
			statements.push(
				'INSERT INTO shopping_extras (id, text, position, created_at) SELECT id, text, position, created_at FROM backup.shopping_extras'
			);
		}
		if (has('trading_orgs')) {
			statements.push(
				'INSERT INTO trading_orgs (id, name, enabled, fee_rate, irrf_rate, fixed_fee, exempt_limit, position, created_at) SELECT id, name, enabled, fee_rate, irrf_rate, fixed_fee, exempt_limit, position, created_at FROM backup.trading_orgs',
				'INSERT INTO trading_orders (id, org_id, ticker, side, qty, unit_price, value, fees, irrf, net, date, month, created_at) SELECT id, org_id, ticker, side, qty, unit_price, value, fees, irrf, net, date, month, created_at FROM backup.trading_orders'
			);
		}
		if (has('trading_targets')) {
			statements.push(
				'INSERT INTO trading_targets (org_id, ticker, target_pct, updated_at) SELECT org_id, ticker, target_pct, updated_at FROM backup.trading_targets'
			);
		}
		if (has('b3_tickers')) {
			statements.push(
				"INSERT INTO b3_tickers (ticker, source, created_at) SELECT ticker, source, created_at FROM backup.b3_tickers"
			);
		}
		if (has('stock_registries')) {
			statements.push(
				`INSERT INTO stock_registries (id, kind, name, name_key, created_at, parent)
					SELECT id, kind, name, name_key, created_at, ${column('stock_registries', 'parent', "''")}
					FROM backup.stock_registries`
			);
		}
		if (has('stock_items')) {
			statements.push(
				`INSERT INTO stock_items (id, kind, name, brand_id, category_id, note, quantity, duration_days, package_size, package_unit, bought_at, expires_at, price, currency, bought_where, ended_at, photo, photo_mime, has_photo, created_at, updated_at)
					SELECT id, ${column('stock_items', 'kind', "'consumable'")}, name,
						${column('stock_items', 'brand_id', 'NULL')},
						${column('stock_items', 'category_id', 'NULL')},
						${column('stock_items', 'note', "''")},
						${column('stock_items', 'quantity', '0')},
						${column('stock_items', 'duration_days', '0')},
						${column('stock_items', 'package_size', '0')},
						${column('stock_items', 'package_unit', "'g'")},
						${column('stock_items', 'bought_at', 'NULL')},
						${column('stock_items', 'expires_at', 'NULL')},
						${column('stock_items', 'price', 'NULL')},
						${column('stock_items', 'currency', "'BRL'")},
						${column('stock_items', 'bought_where', "''")},
						${column('stock_items', 'ended_at', 'NULL')},
						${column('stock_items', 'photo', 'NULL')},
						${column('stock_items', 'photo_mime', "''")},
						${column('stock_items', 'has_photo', '0')},
						created_at, updated_at
					FROM backup.stock_items`
			);
		}
		if (has('stock_item_photos')) {
			statements.push(
				`INSERT INTO stock_item_photos (id, item_id, photo, mime, position, created_at)
					SELECT id, item_id, photo, mime, position, created_at
					FROM backup.stock_item_photos`
			);
		} else if (has('stock_items')) {
			// A pre-gallery backup keeps its single photo on the item row.
			// Lift it into the gallery so current images survive the restore.
			statements.push(
				`INSERT INTO stock_item_photos (id, item_id, photo, mime, position, created_at)
					SELECT 'legacy-' || id, id, photo,
						COALESCE(NULLIF(photo_mime, ''), 'image/jpeg'),
						0, updated_at
					FROM stock_items WHERE photo IS NOT NULL`
			);
		}
		if (has('stock_goals')) {
			statements.push(
				'INSERT INTO stock_goals (id, target_days) SELECT 1, target_days FROM backup.stock_goals WHERE id = 1'
			);
		}
		if (has('stock_category_goals')) {
			statements.push(
				`INSERT INTO stock_category_goals (category_id, people, amount, unit, note)
					SELECT category_id, ${column('stock_category_goals', 'people', '1')},
						${column('stock_category_goals', 'amount', '0')},
						${column('stock_category_goals', 'unit', "'g'")},
						${column('stock_category_goals', 'note', "''")}
					FROM backup.stock_category_goals`
			);
		}
		if (has('stock_item_actions')) {
			statements.push(
				`INSERT INTO stock_item_actions (id, item_id, kind, amount, unit, packages, note, created_at)
					SELECT id, item_id, ${column('stock_item_actions', 'kind', "'consume'")},
						amount, ${column('stock_item_actions', 'unit', "'g'")},
						${column('stock_item_actions', 'packages', '0')},
						${column('stock_item_actions', 'note', "''")},
						created_at
					FROM backup.stock_item_actions`
			);
		}

		target.exec(statements.join(';\n'));
		// Keep the invariant even when the backup was written by an older
		// version that left done items in progress.
		target.exec('UPDATE todo_items SET in_progress = 0 WHERE done = 1 AND in_progress = 1');

		send({ phase: 'search' });
		target.exec('INSERT INTO notes_fts (content, note_id) SELECT content, id FROM notes');
		target.exec('COMMIT');
	} catch (err) {
		try {
			target.exec('ROLLBACK');
		} catch {
			// No transaction left open.
		}
		throw err;
	} finally {
		try {
			target.exec('DETACH DATABASE backup');
		} catch {
			// Already detached.
		}
	}

	// Push the commit into the main database file. Without this the imported
	// rows live only in the WAL, so any other reader of the file (including
	// the download) still sees the previous contents. A busy checkpoint is not
	// a failed restore: the commit is already durable and the same connection
	// sees the new rows.
	try {
		target.pragma('wal_checkpoint(TRUNCATE)');
	} catch {
		// Another connection is reading; it will see the WAL on its next query.
	}

	return {
		notes: count(target, 'notes'),
		tags: count(target, 'note_tags'),
		recaps: count(target, 'weekly_recaps'),
		asks: count(target, 'ask_history'),
		todoGroups: count(target, 'todo_groups'),
		todoItems: count(target, 'todo_items'),
		principles: count(target, 'principles'),
		holdings: count(target, 'holdings'),
		goals: count(target, 'category_goals'),
		valueGoals: count(target, 'category_value_goals'),
		stocks: count(target, 'stock_items'),
		stockGoal: count(target, 'stock_goals'),
		stockActions: count(target, 'stock_item_actions'),
		holdingValueHistory: count(target, 'holding_value_history'),
		portfolioValueHistory: count(target, 'portfolio_value_history'),
		shoppingExtras: count(target, 'shopping_extras'),
		tradingOrgs: count(target, 'trading_orgs'),
		tradingOrders: count(target, 'trading_orders'),
		b3Tickers: count(target, 'b3_tickers')
	};
}

export async function cleanupUploadFile(tempPath: string): Promise<void> {
	for (const suffix of TEMP_SUFFIXES) {
		await unlink(`${tempPath}${suffix}`).catch(() => {});
	}
}

export async function closeUpload(upload: RestoreUpload): Promise<void> {
	try {
		upload.source.close();
	} catch {
		// Already closed.
	}
	await cleanupUploadFile(upload.tempPath);
}
