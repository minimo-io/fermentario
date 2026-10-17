import { json } from '@sveltejs/kit';
import { listNoteComments, createNoteComment } from '$lib/server/db';

export async function GET({ params }) {
	return json({ comments: listNoteComments(params.id) });
}

export async function POST({ params, request }) {
	const body = await request.json();
	const comment = createNoteComment(params.id, String(body?.content ?? ''));
	if (!comment) return json({ error: 'note not found or empty comment' }, { status: 404 });
	return json({ comment }, { status: 201 });
}
