import { json } from '@sveltejs/kit';
import { listTradeHistory } from '$lib/server/db';

/** Buys and sells across every holding, newest first. Opening rows are
 *  excluded because they are the starting balance, not an event. */
export async function GET({ url }) {
	const limit = Number(url.searchParams.get('limit') ?? 50);
	const before = Number(url.searchParams.get('before'));
	const beforeId = url.searchParams.get('before_id');
	const cursor =
		Number.isFinite(before) && before > 0 && beforeId
			? { created_at: before, id: beforeId }
			: null;
	return json(listTradeHistory(limit, cursor));
}
