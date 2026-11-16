import { json } from '@sveltejs/kit';
import { listNostrEvents } from '$lib/server/db';

/** Newest stored events. The section shows five; the relay is the full store,
 *  so there is no paging endpoint. */
export async function GET({ url }) {
	const requested = Number(url.searchParams.get('limit') ?? 5);
	const limit = Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), 1), 50) : 5;
	return json({ events: listNostrEvents(null, limit) });
}
