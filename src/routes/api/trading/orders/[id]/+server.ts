import { json } from '@sveltejs/kit';
import { deleteTradingOrder } from '$lib/server/db';

/** Remove an order. Only the latest order of a venue can go: earlier rows
 *  are the cost basis of later sales. */
export async function DELETE({ params }) {
	const result = deleteTradingOrder(String(params.id ?? ''));
	if ('error' in result) return json({ error: result.error }, { status: 400 });
	return json({ ok: true });
}
