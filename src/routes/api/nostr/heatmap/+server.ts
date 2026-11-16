import { json } from '@sveltejs/kit';
import { getNostrHeatmap } from '$lib/server/db';

/** Per-day counts of the user's published Nostr notes and replies. */
export async function GET() {
	return json(getNostrHeatmap());
}
