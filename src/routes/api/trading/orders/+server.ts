import { json } from '@sveltejs/kit';
import { listTradingOrders, createTradingOrder } from '$lib/server/db';

/** Diary of one venue, oldest first. */
export async function GET({ url }) {
	const org = String(url.searchParams.get('org') ?? 'b3');
	return json({ orders: listTradingOrders(org) });
}

/** Record a buy or a full-position sale. Numbers are computed server-side
 *  from the venue's cost rules, never trusted from the client. */
export async function POST({ request }) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'invalid body' }, { status: 400 });
	}
	const row = body as Record<string, unknown>;
	const saved = createTradingOrder({
		orgId: row?.orgId,
		ticker: row?.ticker,
		side: row?.side,
		qty: row?.qty,
		unitPrice: row?.unitPrice,
		date: row?.date
	});
	if ('error' in saved) return json({ error: saved.error }, { status: 400 });
	return json({ order: saved }, { status: 201 });
}
