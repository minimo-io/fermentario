import { json } from '@sveltejs/kit';
import { getNostrProfile } from '$lib/server/db';
import { decodeNpub } from '$lib/server/nostr';

/** NIP-11 relay information document. Clients (Primal included) read it before
 *  adding the relay. The WebSocket itself is handled by `scripts/relay.mjs` on
 *  the same path — a normal GET never reaches that upgrade listener. */
export async function GET({ url, request }) {
	const profile = getNostrProfile();
	const pubkey = decodeNpub(profile.npub) ?? '';
	return json(
		{
			name: 'Fermentario',
			description: 'Backup relay for the journal\u2019s own Nostr account.',
			pubkey,
			supported_nips: [1, 11],
			software: 'fermentario',
			version: '1.0',
			limitation: {
				max_message_length: 65536,
				max_subscriptions: 20,
				max_limit: 500,
				auth_required: false,
				payment_required: false,
				restricted_writes: true
			}
		},
		{
			headers: {
				'content-type': 'application/nostr+json',
				'access-control-allow-origin': '*'
			}
		}
	);
}
