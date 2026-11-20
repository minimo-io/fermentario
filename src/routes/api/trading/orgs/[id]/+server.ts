import { json } from '@sveltejs/kit';
import { updateTradingOrg } from '$lib/server/db';

/** Edit one venue's cost rules, or flip its enabled flag so a venue can
 *  be previewed and switched off again without a migration. */
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
		spreadRate: row?.spreadRate,
		irrfRate: row?.irrfRate,
		fixedFee: row?.fixedFee,
		feeNote: row?.feeNote,
		exemptLimit: row?.exemptLimit,
		enabled: row?.enabled
	});
	if (!saved) {
		return json(
			{ error: 'unknown organization, or a rate is invalid (rates 0–0.1, amounts >= 0, enabled true/false)' },
			{ status: 400 }
		);
	}
	return json({ org: saved });
}
