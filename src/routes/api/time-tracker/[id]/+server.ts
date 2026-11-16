import { json } from '@sveltejs/kit';
import { deleteTimeEntry } from '$lib/server/db';

export async function DELETE({ params }) {
	const result = deleteTimeEntry(params.id ?? '');
	if (!result.ok) {
		return json({ ok: false, error: result.error }, { status: 404 });
	}
	return json({ ok: true, entry: result.entry });
}
