import { json } from '@sveltejs/kit';
import { deleteTimeEntry, updateTimeEntry } from '$lib/server/db';

export async function DELETE({ params }) {
	const result = deleteTimeEntry(params.id ?? '');
	if (!result.ok) {
		return json({ ok: false, error: result.error }, { status: 404 });
	}
	return json({ ok: true, entry: result.entry });
}

export async function PATCH({ params, request }) {
	const body = await request.json().catch(() => null);
	const result = updateTimeEntry(params.id, body?.comment ?? '');
	if (!result.ok) {
		return json({ ok: false, error: result.error }, { status: 404 });
	}
	return json({ ok: true, entry: result.entry });
}
