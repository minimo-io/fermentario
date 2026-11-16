import { json } from '@sveltejs/kit';
import { addNostrEvent, getNostrProfile, getNostrStats } from '$lib/server/db';
import { decodeNsec, publishToRelays } from '$lib/server/nostr';
import { finalizeEvent } from 'nostr-tools/pure';

/** Sign one kind-1 note with the stored nsec, send it to the account's
 *  relays, and keep it locally so the embedded relay serves it too.
 *
 *  There is no path from a Fermentario note to a relay without this call:
 *  the modal loads a note as an editable draft, never as a pending publish. */
export async function POST({ request }) {
	const body = await request.json().catch(() => ({}));
	const content = String(body?.content ?? '').trim();
	if (!content) return json({ error: 'content is required' }, { status: 400 });
	if (content.length > 10000) return json({ error: 'That note is too long for a kind-1 event.' }, { status: 400 });

	const profile = getNostrProfile();
	if (!profile.nsec) return json({ error: 'No Nostr account configured.' }, { status: 400 });
	const decoded = decodeNsec(profile.nsec);
	if (!decoded) return json({ error: 'The stored nsec is not valid.' }, { status: 400 });

	const event = finalizeEvent(
		{ kind: 1, created_at: Math.floor(Date.now() / 1000), tags: [], content },
		decoded.secretKey
	);

	const publishedTo = await publishToRelays(event, profile.relays);
	addNostrEvent({
		accountId: event.pubkey,
		pubkey: event.pubkey,
		kind: event.kind,
		content: event.content,
		tags: event.tags,
		rawEvent: JSON.stringify(event),
		isReply: false,
		sourceNoteId: typeof body?.sourceNoteId === 'string' ? body.sourceNoteId : null,
		createdAt: event.created_at * 1000
	});

	return json({ event, publishedTo, stats: getNostrStats() });
}
