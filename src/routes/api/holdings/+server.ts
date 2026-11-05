import { json } from '@sveltejs/kit';
import { getHoldingsSummary, createHolding, refreshRates } from '$lib/server/db';

export async function GET() {
	return json(getHoldingsSummary());
}

export async function POST({ request }) {
	const body = await request.json();
	const holding = createHolding(body?.ticker, Number(body?.amount), body?.price ?? null, body?.currency, body?.category, body?.goal ?? null, body?.bank, body?.country, body?.avgPrice ?? null);
	if (!holding) return json({ error: 'ticker must be 1-12 chars (A–Z 0–9 . _ -), amount and goal numbers >= 0, 3-letter currency, 2-letter country' }, { status: 400 });
	return json({ holding, summary: getHoldingsSummary() }, { status: 201 });
}

/** Refresh fiat rates and auto-prices. A forced refresh covers every
 *  auto-priced holding (BTC, stock/FII), even a quote fetched minutes ago;
 *  quiet loads keep the daily cache. Never fails the carousel: a network
 *  error answers with the cached summary plus the error. */
export async function PUT({ request }) {
	const body = await request.json().catch(() => ({}));
	try {
		const summary = await refreshRates(body?.force === true);
		return json({ summary });
	} catch (e) {
		return json({ summary: getHoldingsSummary(), error: (e as Error)?.message ?? 'rates unavailable' });
	}
}
