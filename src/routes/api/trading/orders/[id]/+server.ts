import { json } from '@sveltejs/kit';
import { deleteTradingOrder, updateTradingOrder } from '$lib/server/db';

/** Correct the latest order of a venue. Only that row can change: earlier
 *  rows are the cost basis of later sales. The server recomputes value,
 *  fees, net and the month from the venue's rules. */
export async function PATCH({ params, request }) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'invalid body' }, { status: 400 });
	}
	const row = body as Record<string, unknown>;
	const saved = updateTradingOrder(String(params.id ?? ''), {
		qty: row?.qty,
		unitPrice: row?.unitPrice,
		date: row?.date,
		targetPct: row?.targetPct
	});
	if ('error' in saved) return json({ error: saved.error }, { status: 400 });
	return json({ order: saved });
}

/** Remove an order. Only the latest order of a venue can go: earlier rows
 *  are the cost basis of later sales. */
export async function DELETE({ params }) {
	const result = deleteTradingOrder(String(params.id ?? ''));
	if ('error' in result) return json({ error: result.error }, { status: 400 });
	return json({ ok: true });
}
