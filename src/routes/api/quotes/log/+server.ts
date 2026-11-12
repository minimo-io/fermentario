import { json } from '@sveltejs/kit';
import { listQuoteFetchLog } from '$lib/server/db';

/** What the shared quote system did lately: ticker, source, success or
 *  error. Powers the debug modal in Holdings and Trading. */
export async function GET({ url }) {
	const limit = Number(url.searchParams.get('limit') ?? 100);
	return json({ entries: listQuoteFetchLog(Number.isFinite(limit) ? limit : 100) });
}
