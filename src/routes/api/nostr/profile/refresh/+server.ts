import { json } from '@sveltejs/kit';
import { getNostrProfile, getNostrStats, setNostrProfile } from '$lib/server/db';
import { discoverProfile, nostrStatus } from '$lib/server/nostr';

/** Re-read the account's profile (kind 0) and relay list (kind 10002) from
 *  its relays. Read-only against Nostr: Fermentario never publishes either. */
export async function POST({ url, request }) {
	const current = getNostrProfile();
	if (!current.npub) return json({ error: 'No account configured.' }, { status: 400 });

	const found = await discoverProfile(current.npub, current.relays);
	const profile = setNostrProfile({
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
