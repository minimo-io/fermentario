import { json } from '@sveltejs/kit';
import { getTradingQuoteHistory } from '$lib/server/db';

/** The position's own value line: stored quotes paired with the open
 *  quantity each day. Closed days end the line; unknown tickers yield []. */
export async function GET({ url }) {
	const org = String(url.searchParams.get('org') ?? 'b3');
	const ticker = String(url.searchParams.get('ticker') ?? '');
	return json({ points: getTradingQuoteHistory(org, ticker) });
}
