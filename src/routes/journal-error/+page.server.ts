import { redirect } from '@sveltejs/kit';
import { getJournalStatus } from '$lib/server/journal-store';

export function load() {
	const status = getJournalStatus();
	if (status.state === 'active') throw redirect(307, '/');
	if (status.state === 'none') throw redirect(307, '/welcome');
	return { error: status.error ?? 'The journal could not be opened.' };
}
