import { json } from '@sveltejs/kit';
import { updateHolding, deleteHolding, getHoldingsSummary } from '$lib/server/db';

export async function PATCH({ params, request }) {
	const body = await request.json();
	const patch: { ticker?: string; amount?: number; price?: number | null; currency?: string; category?: string; goal?: number | null; bank?: string; country?: string; avgPrice?: number | null } = {};
	if (body?.ticker !== undefined) patch.ticker = String(body.ticker);
	if (body?.amount !== undefined) patch.amount = Number(body.amount);
	if (body?.price !== undefined) patch.price = body.price === null ? null : Number(body.price);
	if (body?.avgPrice !== undefined) patch.avgPrice = body.avgPrice === null ? null : Number(body.avgPrice);
	if (body?.currency !== undefined) patch.currency = String(body.currency);
	if (body?.category !== undefined) patch.category = String(body.category);
	if (body?.goal !== undefined) patch.goal = body.goal === null ? null : Number(body.goal);
	if (body?.bank !== undefined) patch.bank = String(body.bank);
	if (body?.country !== undefined) patch.country = String(body.country);
	const holding = updateHolding(params.id, patch);
	if (!holding) return json({ error: 'holding not found or invalid patch' }, { status: 404 });
	return json({ holding, summary: getHoldingsSummary() });
}

export async function DELETE({ params }) {
	if (!deleteHolding(params.id)) return json({ error: 'holding not found' }, { status: 404 });
	return json({ summary: getHoldingsSummary() });
}
