import { json } from '@sveltejs/kit';
import { listPrinciples, createPrinciple, setPrincipleOrder } from '$lib/server/db';

export async function GET() {
	return json({ principles: listPrinciples() });
}

export async function POST({ request }) {
	const body = await request.json();
	const p = createPrinciple(String(body?.content ?? ''));
	if (!p) return json({ error: 'empty principle' }, { status: 400 });
	return json({ principle: p }, { status: 201 });
}

/** Reorder: the client sends the full ordered id list. */
export async function PUT({ request }) {
	const body = await request.json();
	if (!Array.isArray(body?.ids)) return json({ error: 'ids must be an array' }, { status: 400 });
	setPrincipleOrder(body.ids.filter((x: unknown) => typeof x === 'string'));
	return json({ principles: listPrinciples() });
}
