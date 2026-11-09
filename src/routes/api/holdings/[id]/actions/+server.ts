import { json } from '@sveltejs/kit';
import { getHoldingsSummary, listHoldingActions, recordHoldingAction } from '$lib/server/db';

export async function GET({ params }) {
	const actions = listHoldingActions(params.id);
	if (!actions) return json({ error: 'holding not found' }, { status: 404 });
	return json({ actions });
}

export async function POST({ params, request }) {
	const body = await request.json().catch(() => ({}));
	const result = recordHoldingAction(
		params.id,
		String(body?.kind ?? ''),
		Number(body?.amount),
		body?.price === undefined || body?.price === null || body?.price === '' ? null : Number(body?.price)
	);
	if (!result.ok) {
		if (result.reason === 'not_found') return json({ error: 'holding not found' }, { status: 404 });
		if (result.reason === 'insufficient') return json({ error: 'not enough to sell' }, { status: 400 });
		return json({ error: 'kind must be buy or sell and amount must be greater than 0' }, { status: 400 });
	}
	return json(
		{
			action: result.action,
			holding: result.holding,
			actions: result.actions,
			summary: getHoldingsSummary()
		},
		{ status: 201 }
	);
}
