import { json } from '@sveltejs/kit';
import { refreshTickerQuote } from '$lib/server/db';

/** One ticker: refresh its auto-priced holding and its trading quote. A
 *  manual holding price and cash are never touched. Upstream failure is a
 *  200 with `ok: false` and the error, like /api/market/refresh. */
export async function POST({ request }) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'invalid body' }, { status: 400 });
	}
	const ticker = String((body as Record<string, unknown>)?.ticker ?? '').trim();
	if (!ticker) return json({ error: 'ticker required' }, { status: 400 });
	return json(await refreshTickerQuote(ticker));
}
