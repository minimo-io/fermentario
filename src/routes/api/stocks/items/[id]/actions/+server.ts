import { json } from '@sveltejs/kit';
import { getStockItem, listStockActions } from '$lib/server/db';

/** Recent consumptions of one stock item, newest first. */
export async function GET({ params }) {
	if (!getStockItem(params.id)) return json({ error: 'stock item not found' }, { status: 404 });
	return json({ actions: listStockActions(params.id) });
}
