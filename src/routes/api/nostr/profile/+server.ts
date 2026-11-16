import { json } from '@sveltejs/kit';
import { getNostrProfile, getNostrStats, setNostrProfile } from '$lib/server/db';
import { decodeNsec, discoverProfile, nostrStatus } from '$lib/server/nostr';

/** Status only: whether a key exists, its npub, the cached profile and relay
 *  list, the relay URL to add in other clients, and the backup counts.
 *  The nsec never leaves the server. */
export async function GET({ url, request }) {
	return json(nostrStatus(getNostrProfile(), getNostrStats(), url, request.headers));
}

/** The only writable field is the nsec. Name, about, picture and the relay
 *  list come from the account's own kind 0 and kind 10002 events, fetched
 *  here and cached for display. */
export async function PUT({ request, url }) {
	const body = await request.json().catch(() => ({}));
	const raw = typeof body?.nsec === 'string' ? body.nsec.trim() : '';
	if (!raw) return json({ error: 'nsec is required' }, { status: 400 });

	const decoded = decodeNsec(raw);
	if (!decoded) return json({ error: 'That is not a valid nsec.' }, { status: 400 });

	const current = getNostrProfile();
	// Reuse the cached list only when the key did not change; a new account
	// must not inherit the old account's relays.
	const seed = current.npub === decoded.npub ? current.relays : [];
	const found = await discoverProfile(decoded.npub, seed);

	const profile = setNostrProfile({
		nsec: raw,
		npub: decoded.npub,
		name: found.name,
		about: found.about,
		picture: found.picture,
		relays: found.relays
	});
	return json({
		...nostrStatus(profile, getNostrStats(), url, request.headers),
		foundProfile: found.foundProfile,
		foundRelays: found.foundRelays
	});
}
