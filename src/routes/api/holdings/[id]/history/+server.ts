import { json } from '@sveltejs/kit';
import { listHoldingValueHistory } from '$lib/server/db';

/** Daily value points for one holding. Later fetches upsert the same day. */
export async function GET({ params, url }) {
	const days = Number(url.searchParams.get('days') ?? 365);
	return json({ points: listHoldingValueHistory(params.id, Number.isFinite(days) ? days : 365) });
}
