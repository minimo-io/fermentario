import { json } from '@sveltejs/kit';
import { addNostrEvent, getNostrProfile, getNostrStats } from '$lib/server/db';
import { fetchOwnEvents, isReplyEvent } from '$lib/server/nostr';
import { isSyncRunning, setLastSyncAt, setSyncRunning } from '$lib/server/nostr-sync';
import { verifyEvent } from 'nostr-tools/pure';

const DEFAULT_LIMIT = 500;
const MAX_LIMIT = 500;

/** One page of the backup: read a batch of the account's kind-1 events from
 *  its relays and keep the ones that verify.
 *
 *  The client drives the loop: it sends no body for the newest batch, then
 *  `{ until: nextCursor }` for each older one, with a pause between calls so a
 *  long account does not hammer the relays. `hasMore` means "the last page
 *  added something new, so older events may exist": the loop continues until
 *  a page adds nothing. That also covers relays that return fewer events than
 *  the requested page, since a short page is not proof of the end.
 */
export async function POST({ request }) {
	const profile = getNostrProfile();
	if (!profile.npub) return json({ error: 'No account configured.' }, { status: 400 });
	// Two tabs would fetch the same pages in parallel; let the first one work.
	if (isSyncRunning()) {
		return json({ error: 'A backup is already running.', running: true }, { status: 409 });
	}

	const body = await request.json().catch(() => ({}));
	const until = typeof body?.until === 'number' && body.until > 0 ? Math.trunc(body.until) : 0;
	const limit = Math.min(
		Math.max(Math.trunc(Number(body?.limit) || DEFAULT_LIMIT), 1),
		MAX_LIMIT
	);

	setSyncRunning(true);
	try {
		const before = getNostrStats().total;
		const events = await fetchOwnEvents(profile.npub, profile.relays, { until, limit });
		for (const event of events) {
			if (!verifyEvent(event)) continue;
			addNostrEvent({
				accountId: event.pubkey,
				pubkey: event.pubkey,
				kind: event.kind,
				content: event.content,
				tags: event.tags,
				rawEvent: JSON.stringify(event),
				isReply: isReplyEvent(event),
				createdAt: event.created_at * 1000
			});
		}
		const stats = getNostrStats();
		const imported = Math.max(0, stats.total - before);
		const lastSyncAt = setLastSyncAt();
		return json({
			imported,
			fetched: events.length,
			hasMore: imported > 0,
			nextCursor: events.length ? events[events.length - 1].created_at : 0,
			stats,
			lastSyncAt
		});
	} finally {
		setSyncRunning(false);
	}
}
