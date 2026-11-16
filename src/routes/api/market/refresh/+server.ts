import { json } from '@sveltejs/kit';
import { refreshMarket } from '$lib/server/db';

/** One global update: forced holdings refresh plus fresh quotes for every
 *  open trading ticker. Always 200 with the cached summary when upstream
 *  fails; errors ride along for the toast. */
export async function POST() {
	const result = await refreshMarket();
	return json(result);
}
