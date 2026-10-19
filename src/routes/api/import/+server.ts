import Database from 'better-sqlite3';
import { writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { db } from '$lib/server/db';
import { resetSummaryCache } from '$lib/server/summary-cache';

const dataDir = resolve(process.env['FERMENTARIO_DATA_DIR'] ?? './data');
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

// Every export contains these tables. Newer tables are optional so a backup
// written before To-Do lists, principles or tag colors still restores.
const REQUIRED_TABLES = ['notes', 'note_tags', 'weekly_recaps', 'ask_history'] as const;

const TEMP_SUFFIXES = ['', '-shm', '-wal', '-journal'];

/** Restore the journal from a database produced by /api/export.
 *
 *  The response is an event stream so the client can show what is happening:
 *  the upload itself, the validation, the row replacement, the search index
 *  rebuild and the final checkpoint. The stream is opened before the body is
 *  read, so the first phase is visible while the file is still uploading.
 *
 *  The live database is never swapped on disk: the server holds an open handle,
 *  so replacing the file would leave the process writing to a deleted inode.
 *  The upload is ATTACHed and copied through the existing connection in one
 *  transaction.
 *
 *  Export is the whole database, so restore must mirror every section:
 *  notes, tasks, principles, comments, tag colors, recaps and ask history.
 *  Tables that an older backup does not contain are left untouched. */
export async function POST({ request }) {
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const send = (data: unknown) => {
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
			};
			let tempPath: string | null = null;
			let source: Database.Database | null = null;
			try {
				send({ phase: 'uploading' });
				const form = await request.formData();
				const file = form.get('file');
				if (!(file instanceof File) || file.size === 0) {
					send({ error: 'Choose a database file to restore.' });
					return;
				}
				if (file.size > MAX_UPLOAD_BYTES) {
					send({ error: 'That file is larger than 100 MB.' });
					return;
				}

				tempPath = resolve(dataDir, `import-${randomUUID()}.db`);
				await writeFile(tempPath, Buffer.from(await file.arrayBuffer()));

				send({ phase: 'validating' });
				const uploaded = new Database(tempPath, { readonly: true, fileMustExist: true });
				source = uploaded;
				// SQLite opens files lazily, so a text file or a truncated
				// database only fails on the first read.
				let found = new Set<string>();
				try {
					const check = uploaded.pragma('quick_check', { simple: true }) as string;
					if (check !== 'ok') throw new Error('that database is damaged');
					found = new Set(
						(
							uploaded.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
								name: string;
							}[]
						).map((r) => r.name)
					);
					const missing = REQUIRED_TABLES.filter((t) => !found.has(t));
					if (missing.length > 0) throw new Error(`not a fermentario database (missing ${missing.join(', ')})`);
				} catch (err) {
					send({ error: `That file cannot be restored: ${(err as Error)?.message ?? 'unknown error'}` });
					return;
				}

				const has = (table: string) => found.has(table);
				const columnCache = new Map<string, Set<string>>();
				const columns = (table: string) => {
					let known = columnCache.get(table);
					if (!known) {
						known = new Set(
							(uploaded.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map(
								(c) => c.name
							)
						);
						columnCache.set(table, known);
					}
					return known;
				};
				// Old exports lack columns added by later migrations. Select a
				// literal default instead of failing the whole restore.
				const column = (table: string, name: string, fallback: string) =>
					columns(table).has(name) ? name : fallback;
				const hasTodo = has('todo_groups') && has('todo_items');

				// exec() does not bind parameters, so the path is inlined. It is
				// a path we generated, and quotes are escaped for safety.
				db.exec(`ATTACH DATABASE '${tempPath.replace(/'/g, "''")}' AS backup`);
				try {
					db.exec('BEGIN IMMEDIATE');

					send({ phase: 'replacing' });
					// Children cascade from their parents (foreign_keys = ON):
					// notes owns tags/vectors/comments, todo_items owns task
					// comments and tags, principles owns tags and comments.
					// notes_fts is a virtual table with no foreign key, so it is
					// emptied explicitly or every restore stacks another copy of
					// the index and stale notes stay searchable.
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
							`INSERT INTO note_comments (id, note_id, content, created_at)
								SELECT id, note_id, content, created_at FROM backup.note_comments`
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
								`INSERT INTO task_comments (id, item_id, content, created_at)
									SELECT id, item_id, content, created_at FROM backup.task_comments`
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
								`INSERT INTO principle_comments (id, principle_id, content, created_at)
									SELECT id, principle_id, content, created_at FROM backup.principle_comments`
							);
						}
					}
					if (has('tag_colors')) {
						statements.push(
							'INSERT INTO tag_colors (tag, color) SELECT tag, color FROM backup.tag_colors'
						);
					}

					db.exec(statements.join(';\n'));
					// Keep the invariant even when the backup was written by an
					// older version that left done items in progress.
					db.exec('UPDATE todo_items SET in_progress = 0 WHERE done = 1 AND in_progress = 1');

					send({ phase: 'search' });
					db.exec('INSERT INTO notes_fts (content, note_id) SELECT content, id FROM notes');
					db.exec('COMMIT');
				} catch (err) {
					try {
						db.exec('ROLLBACK');
					} catch {
						// No transaction left open.
					}
					throw err;
				} finally {
					try {
						db.exec('DETACH DATABASE backup');
					} catch {
						// Already detached.
					}
				}

				send({ phase: 'finishing' });
				// Push the commit into the main database file. Without this the
				// imported rows live only in the WAL, so any other reader of
				// fermentario.db (including the download) still sees the
				// previous contents.
				db.pragma('wal_checkpoint(TRUNCATE)');
				resetSummaryCache();

				const count = (table: string) =>
					(db.prepare(`SELECT COUNT(*) AS c FROM ${table}`).get() as { c: number }).c;
				const counts = {
					notes: count('notes'),
					tags: count('note_tags'),
					recaps: count('weekly_recaps'),
					asks: count('ask_history'),
					todoGroups: count('todo_groups'),
					todoItems: count('todo_items'),
					principles: count('principles')
				};
				send({ done: true, counts });
			} catch (err) {
				try {
					send({ error: `Restore failed: ${(err as Error)?.message ?? 'unknown error'}` });
				} catch {
					// The client is gone.
				}
			} finally {
				try {
					source?.close();
				} catch {
					// Already closed.
				}
				if (tempPath) {
					// Opening the upload creates -shm and -wal siblings next to it.
					for (const suffix of TEMP_SUFFIXES) {
						await unlink(`${tempPath}${suffix}`).catch(() => {});
					}
				}
				try {
					controller.close();
				} catch {
					// Already closed or cancelled.
				}
			}
		}
	});

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-cache',
			'x-accel-buffering': 'no'
		}
	});
}
