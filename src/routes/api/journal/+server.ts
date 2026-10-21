import { json } from '@sveltejs/kit';
import {
	JournalExistsError,
	beginOnboarding,
	createBlankJournal,
	endOnboarding,
	getJournalStatus,
	resetJournalStore
} from '$lib/server/journal-store';

/** Return the active journal, or run the one-time legacy import if needed. */
export async function GET({ url }) {
	if (url.searchParams.get('retry') === '1') resetJournalStore();
	const status = getJournalStatus();
	return json(status, { status: status.state === 'error' ? 503 : 200 });
}

/**
 * Create an empty journal. It is deliberately blocked when a journal is
 * already active: creating a second blank file would hide the user's data.
 */
export async function POST() {
	if (!beginOnboarding()) {
		return json({ error: 'Another journal is being set up.' }, { status: 409 });
	}
	try {
		const status = getJournalStatus();
		if (status.state === 'active') {
			return json({ error: 'A journal is already active.' }, { status: 409 });
		}
		if (status.state === 'error') {
			return json(
				{ error: status.error ?? 'The current journal is unavailable.' },
				{ status: 409 }
			);
		}
		try {
			const journal = createBlankJournal();
			return json({ state: 'active', journal }, { status: 201 });
		} catch (err) {
			if (err instanceof JournalExistsError) {
				return json({ error: err.message }, { status: 409 });
			}
			return json(
				{ error: (err as Error)?.message ?? 'The journal could not be created.' },
				{ status: 500 }
			);
		}
	} finally {
		endOnboarding();
	}
}
