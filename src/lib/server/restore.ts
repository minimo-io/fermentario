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
			'DELETE FROM ask_history'
		];
		if (hasTodo) statements.push('DELETE FROM todo_items', 'DELETE FROM todo_groups');
		if (has('principles')) statements.push('DELETE FROM principles');
		if (has('tag_colors')) statements.push('DELETE FROM tag_colors');

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
				`INSERT INTO todo_items (id, group_id, content, done, done_at, in_progress, subgroup, position, created_at, updated_at)
					SELECT id, group_id, content, done,
						${column('todo_items', 'done_at', '0')},
						${column('todo_items', 'in_progress', '0')},
						${column('todo_items', 'subgroup', "''")},
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
		principles: count(target, 'principles')
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
