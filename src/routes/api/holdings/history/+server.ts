import { json } from '@sveltejs/kit';
import { listPortfolioValueHistory } from '$lib/server/db';

/** Daily portfolio totals in USD. Later fetches upsert the same day. */
export async function GET({ url }) {
	const days = Number(url.searchParams.get('days') ?? 365);
	return json({ points: listPortfolioValueHistory(Number.isFinite(days) ? days : 365) });
}
