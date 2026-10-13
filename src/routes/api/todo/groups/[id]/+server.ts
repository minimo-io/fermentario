import { json } from '@sveltejs/kit';
import { renameTodoGroup, deleteTodoGroup } from '$lib/server/db';

/** Rename a group. Items follow because they reference the group id. */
export async function PATCH({ params, request }) {
	const body = await request.json();
	const group = renameTodoGroup(params.id, String(body?.name ?? ''));
	if (!group) return json({ error: 'group not found or empty name' }, { status: 404 });
	return json({ group });
}

export async function DELETE({ params }) {
	if (!deleteTodoGroup(params.id)) return json({ error: 'group not found' }, { status: 404 });
	return json({ ok: true });
}
