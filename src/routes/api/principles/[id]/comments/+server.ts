import { json } from '@sveltejs/kit';
import { listPrincipleComments, createPrincipleComment } from '$lib/server/db';

export async function GET({ params }) {
	return json({ comments: listPrincipleComments(params.id) });
}

export async function POST({ params, request }) {
	const body = await request.json();
	const comment = createPrincipleComment(params.id, String(body?.content ?? ''));
	if (!comment) return json({ error: 'principle not found or empty comment' }, { status: 404 });
	return json({ comment }, { status: 201 });
}
