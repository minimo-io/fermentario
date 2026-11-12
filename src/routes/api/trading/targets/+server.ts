import { json } from '@sveltejs/kit';
import { setTradingTarget } from '$lib/server/db';

/** Profit target for one open ticker, as a fraction (0.03 = 3%). */
export async function POST({ request }) {
	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'invalid body' }, { status: 400 });
	}
	const row = body as Record<string, unknown>;
	const saved = setTradingTarget(String(row?.orgId ?? ''), String(row?.ticker ?? ''), row?.targetPct);
	if (!saved) return json({ error: 'unknown or disabled organization, bad ticker, or target outside 0–10' }, { status: 400 });
	return json(saved);
}
