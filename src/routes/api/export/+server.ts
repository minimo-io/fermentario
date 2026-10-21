import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { getDb } from '$lib/server/db';

/** Streams the journal database as a file download.
 *
 *  The database runs in WAL mode, so recent writes can sit in `fermentario.db-wal`
 *  instead of the main file. Copying the raw file would hand out a database that
 *  is missing the latest notes, so the WAL is checkpointed into the main file
 *  first. The checkpoint can report busy while another connection reads; that is
 *  not an error here, the file is still consistent, and the download is
 *  read-only from that point on. */
export async function GET() {
	const db = getDb();
	try {
		db.pragma('wal_checkpoint(TRUNCATE)');
	} catch {
		// A busy checkpoint still leaves a readable database file.
	}

	const stamp = new Date().toISOString().slice(0, 10);
	return new Response(Readable.toWeb(createReadStream(db.filename)) as ReadableStream, {
		headers: {
			'content-type': 'application/vnd.sqlite3',
			'content-disposition': `attachment; filename="fermentario-${stamp}.db"`,
			'cache-control': 'no-store'
		}
	});
}
