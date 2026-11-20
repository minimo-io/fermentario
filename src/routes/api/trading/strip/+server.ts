import { json } from '@sveltejs/kit';
import { getTradingStrip } from '$lib/server/db';

/** Open tickers across every enabled venue plus their money totals in USD,
 *  BRL and UYU: the home-page strip. */
export async function GET() {
	const strip = getTradingStrip();
	return json({ positions: strip.positions, totals: strip.totals });
}
