import { json } from '@sveltejs/kit';
import { updatePrinciple, deletePrinciple } from '$lib/server/db';

export async function PATCH({ params, request }) {
	const body = await request.json();
	const p = updatePrinciple(params.id, String(body?.content ?? ''));
	if (!p) return json({ error: 'principle not found or empty' }, { status: 404 });
	return json({ principle: p });
}

export async function DELETE({ params }) {
	if (!deletePrinciple(params.id)) return json({ error: 'principle not found' }, { status: 404 });
	return json({ ok: true });
}
