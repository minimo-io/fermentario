import { json } from '@sveltejs/kit';
import { deleteTaskComment } from '$lib/server/db';

export async function DELETE({ params }) {
	if (!deleteTaskComment(params.id, params.commentId)) {
		return json({ error: 'comment not found' }, { status: 404 });
	}
	return json({ ok: true });
}
