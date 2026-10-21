import { json, redirect, type Handle } from '@sveltejs/kit';
import { getJournalStatus } from '$lib/server/journal-store';

/**
 * Gate every page and data API on an active journal.
 *
 * `/welcome`, `/journal-error`, `/diagnostics`, `/api/status` and the journal
 * onboarding endpoints are allowed without a journal. Everything else either
 * redirects to onboarding or returns a machine-readable 409. The check is in
 * one place so a new route cannot accidentally open a database that does not
 * exist.
 */
export const handle: Handle = async ({ event, resolve }) => {
	// Static assets and the generated error page have no route id.
	if (event.route.id === null) return resolve(event);

	const path = event.url.pathname;
	const isApi = path.startsWith('/api/');
	const status = getJournalStatus();
	event.locals.journalId = status.state === 'active' ? (status.journal?.id ?? null) : null;

	if (status.state === 'active') {
		if (path === '/welcome' || path === '/journal-error') throw redirect(307, '/');
		return resolve(event);
	}

	if (status.state === 'error') {
		if (path === '/api/status' || path === '/api/journal' || path === '/api/journal/restore') {
			return resolve(event);
		}
		if (path === '/journal-error') return resolve(event);
		if (path === '/welcome') throw redirect(307, '/journal-error');
		if (isApi) {
			return json(
				{ code: 'JOURNAL_ERROR', error: status.error ?? 'The active journal is unavailable.' },
				{ status: 503 }
			);
		}
		throw redirect(307, '/journal-error');
	}

	// No journal yet.
	if (
		path === '/welcome' ||
		path === '/diagnostics' ||
		path === '/api/status' ||
		path === '/api/journal' ||
		path === '/api/journal/restore'
	) {
		return resolve(event);
	}
	if (path === '/journal-error') throw redirect(307, '/welcome');
	if (isApi) {
		return json(
			{ code: 'NO_JOURNAL', error: 'Create or restore a journal before using this endpoint.' },
			{ status: 409 }
		);
	}
	throw redirect(307, '/welcome');
};
