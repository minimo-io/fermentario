import { json } from '@sveltejs/kit';
import { getTimeTrackerStats } from '$lib/server/db';

export async function GET({ url }) {
	const period = url.searchParams.get('period') ?? 'month';
	const at = url.searchParams.get('at') ?? undefined;
	const stats = getTimeTrackerStats(period, at);
	return json(stats);
}
