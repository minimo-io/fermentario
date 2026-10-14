import { json } from '@sveltejs/kit';
import { listTaskComments, createTaskComment } from '$lib/server/db';

export async function GET({ params }) {
	return json({ comments: listTaskComments(params.id) });
}

export async function POST({ params, request }) {
	const body = await request.json();
	const comment = createTaskComment(params.id, String(body?.content ?? ''));
	if (!comment) return json({ error: 'item not found or empty comment' }, { status: 404 });
	return json({ comment }, { status: 201 });
}
