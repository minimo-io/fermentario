import { json } from '@sveltejs/kit';
import { updateTradingOrg } from '$lib/server/db';

/** Edit one venue's cost rules. Disabled venues stay untouched until Ripio
 *  (or the next org) ships with real rules. */
export async function PATCH({ params, request }) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'invalid body' }, { status: 400 });
	}
	const row = body as Record<string, unknown>;
	const saved = updateTradingOrg(String(params.id ?? ''), {
		feeRate: row?.feeRate,
		irrfRate: row?.irrfRate,
		fixedFee: row?.fixedFee,
		exemptLimit: row?.exemptLimit
	});
	if (!saved) {
		return json(
			{ error: 'unknown or disabled organization, or a rate is invalid (rates 0–0.1, amounts >= 0)' },
			{ status: 400 }
		);
	}
	return json({ org: saved });
}
