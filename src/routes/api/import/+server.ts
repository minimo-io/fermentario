import Database from 'better-sqlite3';
import { writeFile, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { db } from '$lib/server/db';
import { resetSummaryCache } from '$lib/server/summary-cache';

const dataDir = resolve(process.env['FERMENTARIO_DATA_DIR'] ?? './data');
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

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
 *  transaction. */
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
				source = new Database(tempPath, { readonly: true, fileMustExist: true });
				// SQLite opens files lazily, so a text file or a truncated
				// database only fails on the first read.
				try {
					const check = source.pragma('quick_check', { simple: true }) as string;
					if (check !== 'ok') throw new Error('that database is damaged');
					const found = new Set(
						(
							source.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as {
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

				// exec() does not bind parameters, so the path is inlined. It is
				// a path we generated, and quotes are escaped for safety.
				db.exec(`ATTACH DATABASE '${tempPath.replace(/'/g, "''")}' AS backup`);
				try {
					db.exec('BEGIN IMMEDIATE');

					send({ phase: 'replacing' });
					// notes cascades into note_tags and note_vectors (foreign_keys
					// = ON). notes_fts is a virtual table with no foreign key, so it
					// has to be emptied explicitly or every restore stacks another
					// copy of the index and stale notes stay searchable.
					db.exec(`
						DELETE FROM notes;
						DELETE FROM notes_fts;
						DELETE FROM weekly_recaps;
						DELETE FROM ask_history;

						INSERT INTO notes (id, content, created_at, updated_at)
							SELECT id, content, created_at, updated_at FROM backup.notes;
						INSERT INTO note_tags (note_id, tag)
							SELECT note_id, tag FROM backup.note_tags;
						INSERT INTO note_vectors (note_id, vector)
							SELECT note_id, vector FROM backup.note_vectors;
						INSERT INTO weekly_recaps (week_key, content, created_at, updated_at)
							SELECT week_key, content, created_at, updated_at FROM backup.weekly_recaps;
						INSERT INTO ask_history (id, question, answer, sources, created_at)
							SELECT id, question, answer, sources, created_at FROM backup.ask_history;
					`);

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

				const counts = {
					notes: (db.prepare('SELECT COUNT(*) AS c FROM notes').get() as { c: number }).c,
					tags: (db.prepare('SELECT COUNT(*) AS c FROM note_tags').get() as { c: number }).c,
					recaps: (db.prepare('SELECT COUNT(*) AS c FROM weekly_recaps').get() as { c: number }).c,
					asks: (db.prepare('SELECT COUNT(*) AS c FROM ask_history').get() as { c: number }).c
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
