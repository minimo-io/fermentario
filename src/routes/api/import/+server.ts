import { getDb } from '$lib/server/db';
import { getActiveJournalInfo } from '$lib/server/journal-store';
import { emitJournalChange } from '$lib/server/journal-events';
import { resetSummaryCache } from '$lib/server/summary-cache';
import {
	closeUpload,
	copyUploadIntoTarget,
	readAndValidateUpload,
	type RestoreUpload
} from '$lib/server/restore';

/**
 * Replace the rows in the active journal with an uploaded export.
 *
 * The response is an event stream so the client can show what is happening:
 * the upload itself, validation, row replacement, search rebuild and the final
 * checkpoint. Onboarding has its own route that uses the same restore core to
 * create a new journal instead of replacing the active one.
 */
export async function POST({ request }) {
	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const send = (data: unknown) => {
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
			};
			let upload: RestoreUpload | null = null;
			try {
				upload = await readAndValidateUpload(request, send);
				const counts = copyUploadIntoTarget(getDb(), upload, send);
				// The file is the same journal, but every row changed. Clear the
				// per-journal caches and stop any in-flight indexing from writing
				// vectors or tags for the old rows.
				emitJournalChange(getActiveJournalInfo()?.id ?? null);
				send({ phase: 'finishing' });
				resetSummaryCache();
				send({ done: true, counts });
			} catch (err) {
				try {
					send({ error: (err as Error)?.message ?? 'Restore failed.' });
				} catch {
					// The client is gone.
				}
			} finally {
				if (upload) await closeUpload(upload);
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
