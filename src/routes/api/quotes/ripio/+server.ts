import { json } from '@sveltejs/kit';
import { getRipioQuote } from '$lib/server/db';

/** Ripio BTC quote in USD (BTC_USDC tracks the dollar). Public endpoint,
 *  cached for a minute; throttled refreshes serve the cached price.
 *  `force=1` (the page's Refresh) bypasses the minute cache.
 *  Independent from the holdings BTC price — neither can break the other.
 *  Always 200: a cold failure arrives as a typed error, never an exception. */
export async function GET({ url }) {
	const saved = await getRipioQuote(url.searchParams.get('pair') ?? 'BTC_USDC', url.searchParams.get('force') === '1');
	return json(saved);
}
