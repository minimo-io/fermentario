import { json } from '@sveltejs/kit';
import { getStockGoals, setStockGoals } from '$lib/server/db';

/** The consumable coverage target in days (default: one year). */
export async function GET() {
	return json(getStockGoals());
}

export async function PUT({ request }) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'invalid body' }, { status: 400 });
	}
	const t = Math.trunc(Number((body as Record<string, unknown>)?.target_days));
	if (!Number.isFinite(t) || t < 1 || t > 3650) {
		return json({ error: 'target_days must be a whole number of days, 1 to 3650' }, { status: 400 });
	}
	const goals = setStockGoals(t);
	if (!goals) return json({ error: 'could not save the stock goal' }, { status: 500 });
	return json(goals);
}
