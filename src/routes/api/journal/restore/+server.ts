import { json } from '@sveltejs/kit';
import {
	beginOnboarding,
	createJournalScaffold,
	discardJournalScaffold,
	endOnboarding,
	finishJournalScaffold,
	getJournalStatus,
	type JournalScaffold
} from '$lib/server/journal-store';
import {
	closeUpload,
	copyUploadIntoTarget,
	readAndValidateUpload,
	type RestoreUpload
} from '$lib/server/restore';

/**
 * Restore a backup during onboarding. It always creates a separate journal,
 * copies the backup into it, and only then makes it active. A failed import
 * deletes the new journal and leaves the previous state untouched.
 */
export async function POST({ request }) {
	const status = getJournalStatus();
	if (status.state === 'active') {
		return json({ error: 'A journal is already active.' }, { status: 409 });
	}
	if (!beginOnboarding()) {
		return json({ error: 'Another journal is being set up.' }, { status: 409 });
	}

	const encoder = new TextEncoder();
	const stream = new ReadableStream<Uint8Array>({
		async start(controller) {
			const send = (data: unknown) => {
				controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
			};
			let upload: RestoreUpload | null = null;
			let scaffold: JournalScaffold | null = null;
			try {
				upload = await readAndValidateUpload(request, send);
				scaffold = createJournalScaffold();
				const counts = copyUploadIntoTarget(scaffold.db, upload, send);
				send({ phase: 'finishing' });
				const pending = scaffold;
				scaffold = null;
				finishJournalScaffold(pending);
				send({ done: true, counts });
			} catch (err) {
				if (scaffold) discardJournalScaffold(scaffold);
				try {
					send({ error: (err as Error)?.message ?? 'Restore failed.' });
				} catch {
					// The client is gone.
				}
			} finally {
				if (upload) await closeUpload(upload);
				endOnboarding();
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
