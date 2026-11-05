import { json } from '@sveltejs/kit';
import { setHoldingsGoals, getHoldingsSummary } from '$lib/server/db';

/** Save allocation goals and/or independent value targets in one transaction.
 *  The flat `{ btc, fii, cash }` body stays supported for older clients and
 *  changes only the percentages. */
export async function PUT({ request }) {
	const body = await request.json().catch(() => ({}));
	let pct: { btc: number; fii: number; cash: number } | null = null;
	if (body?.pct && typeof body.pct === 'object') {
		pct = {
			btc: Number(body.pct.btc),
			fii: Number(body.pct.fii),
			cash: Number(body.pct.cash)
		};
	} else if (body?.btc !== undefined || body?.fii !== undefined || body?.cash !== undefined) {
		pct = { btc: Number(body.btc), fii: Number(body.fii), cash: Number(body.cash) };
	}
	let values: { btc: number | null; fii: number | null; cash: number | null } | null = null;
	if (body?.values && typeof body.values === 'object') {
		const read = (v: unknown) => (v === null || v === undefined ? null : Number(v));
		values = {
			btc: read(body.values.btc),
			fii: read(body.values.fii),
			cash: read(body.values.cash)
		};
	}
	if (!pct && !values) return json({ error: 'send pct and/or values' }, { status: 400 });
	const result = setHoldingsGoals(pct, values);
	if (!result.ok) {
		return json(
			{
				error:
					result.field === 'pct'
						? 'allocation goals must be 0-100 each and add up to 100'
						: 'value targets must be null or greater than 0'
			},
			{ status: 400 }
		);
	}
	return json({ summary: getHoldingsSummary() });
}
