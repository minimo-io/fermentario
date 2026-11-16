import { json } from '@sveltejs/kit';
import { getGlobalBtcQuote } from '$lib/server/db';

/** Canonical BTC-USD (Coinbase) for the Ripio vs global comparison card.
 *  Serves the stored daily rate; ?force=1 refetches. Always 200: a cold
 *  failure arrives as a typed error, never an exception. */
export async function GET({ url }) {
	return json(await getGlobalBtcQuote(url.searchParams.get('force') === '1'));
}
