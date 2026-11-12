import { json } from '@sveltejs/kit';
import { listB3Tickers, addB3Ticker } from '$lib/server/db';

/** B3 ticker universe for the order picker. Cached server-side for 24h;
 *  custom rows persist for the future admin. */
export async function GET() {
	return json({ tickers: listB3Tickers() });
}

/** Add one ticker to the universe. Manual order entry never needs this:
 *  any well-formed ticker saves without being listed. */
export async function POST({ request }) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'invalid body' }, { status: 400 });
	}
	const saved = addB3Ticker((body as Record<string, unknown>)?.ticker);
	if ('error' in saved) return json({ error: saved.error }, { status: 400 });
	return json(saved, { status: 201 });
}
