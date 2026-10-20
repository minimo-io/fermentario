import { json } from '@sveltejs/kit';
import { deletePrincipleComment, updatePrincipleComment } from '$lib/server/db';

export async function PATCH({ params, request }) {
	const body = await request.json();
	const content = String(body?.content ?? '').trim();
	if (!content) return json({ error: 'empty comment' }, { status: 400 });
	const comment = updatePrincipleComment(params.id, params.commentId, content);
	if (!comment) return json({ error: 'comment not found' }, { status: 404 });
	return json({ comment });
}

export async function DELETE({ params }) {
	if (!deletePrincipleComment(params.id, params.commentId)) {
		return json({ error: 'comment not found' }, { status: 404 });
	}
	return json({ ok: true });
}
