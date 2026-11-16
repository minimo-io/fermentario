import { json } from '@sveltejs/kit';
import { isRelayEnabled, setRelayEnabled } from '$lib/server/relay-control';
import { relayUrlFrom } from '$lib/server/nostr';

/** The switch and the dot in the Nostr section. GET reports the state; POST
 *  flips it. The WebSocket listener checks the same registry key, so a
 *  stopped relay refuses the handshake instead of silently accepting. */
function status(url: URL, request: Request) {
	return {
		running: isRelayEnabled(),
		url: relayUrlFrom(url, request.headers)
	};
}

export async function GET({ url, request }) {
	return json(status(url, request));
}

export async function POST({ url, request }) {
	const body = await request.json().catch(() => ({}));
	if (typeof body?.running !== 'boolean') {
		return json({ error: 'running must be a boolean' }, { status: 400 });
	}
	setRelayEnabled(body.running);
	return json(status(url, request));
}
