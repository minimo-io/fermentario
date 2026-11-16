import { json } from '@sveltejs/kit';
import { deleteBookNote, updateBookNote } from '$lib/server/db';

export async function PATCH({ params, request }) {
	const body = await request.json().catch(() => ({}));
	const note = updateBookNote(params.noteId, { note: body?.note, excerpt: body?.excerpt });
	if (!note) return json({ error: 'not found' }, { status: 404 });
	return json({ note });
}

export async function DELETE({ params }) {
	if (!deleteBookNote(params.noteId)) return json({ error: 'not found' }, { status: 404 });
	return json({ ok: true });
}
