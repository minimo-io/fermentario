import { json } from '@sveltejs/kit';
import { recordStockConsume } from '$lib/server/db';

/** Log a consumption and deduct it from the item. The unit must belong to
 *  the same family as the item's package unit (grams with kilograms,
 *  millilitres with litres). */
export async function POST({ params, request }) {
	let body: Record<string, unknown>;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'invalid body' }, { status: 400 });
	}
	const amount = Number(body?.amount);
	if (!Number.isFinite(amount) || amount <= 0 || amount > 1e12) {
		return json({ error: 'amount must be greater than 0' }, { status: 400 });
	}
	const unit = String(body?.unit ?? '').trim();
	if (!['g', 'kg', 'ml', 'l', 'L'].includes(unit)) {
		return json({ error: 'unit must be g, kg, ml or L' }, { status: 400 });
	}
	const note = typeof body?.note === 'string' ? body.note : '';
	const result = recordStockConsume(params.id, amount, unit, note);
	if (!result) {
		return json(
			{ error: 'consuming needs a consumable with a package size and a unit in its family' },
			{ status: 400 }
		);
	}
	return json(result);
}
