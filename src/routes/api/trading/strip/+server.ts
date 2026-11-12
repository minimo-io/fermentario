import { json } from '@sveltejs/kit';
import { getTradingStrip } from '$lib/server/db';

/** Open tickers across every enabled venue: the home-page strip. */
export async function GET() {
	return json({ positions: getTradingStrip() });
}
