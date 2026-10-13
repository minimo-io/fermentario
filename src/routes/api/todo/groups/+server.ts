import { json } from '@sveltejs/kit';
import { listTodoGroups, createTodoGroup } from '$lib/server/db';

export async function GET() {
	return json({ groups: listTodoGroups() });
}

export async function POST({ request }) {
	const body = await request.json();
	const group = createTodoGroup(String(body?.name ?? ''));
	if (!group) return json({ error: 'empty group name' }, { status: 400 });
	return json({ group }, { status: 201 });
}
