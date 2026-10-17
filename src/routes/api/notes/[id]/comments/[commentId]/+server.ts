import { json } from '@sveltejs/kit';
import { deleteNoteComment } from '$lib/server/db';

export async function DELETE({ params }) {
	if (!deleteNoteComment(params.id, params.commentId)) {
		return json({ error: 'comment not found' }, { status: 404 });
	}
	return json({ ok: true });
}
