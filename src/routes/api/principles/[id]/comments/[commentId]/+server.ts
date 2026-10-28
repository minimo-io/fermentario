import { json } from '@sveltejs/kit';
import { deletePrincipleComment, updatePrincipleComment } from '$lib/server/db';
import { parseCommentPatch } from '$lib/server/comment-patch';

export async function PATCH({ params, request }) {
	const body = await request.json();
	const patch = parseCommentPatch(body);
	if (!patch) return json({ error: 'empty patch' }, { status: 400 });
	const comment = updatePrincipleComment(params.id, params.commentId, patch);
	if (!comment) return json({ error: 'comment not found' }, { status: 404 });
	return json({ comment });
}

export async function DELETE({ params }) {
	if (!deletePrincipleComment(params.id, params.commentId)) {
		return json({ error: 'comment not found' }, { status: 404 });
	}
	return json({ ok: true });
}
