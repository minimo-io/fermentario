import { json } from '@sveltejs/kit';
import { listTodoGroups, createTodoGroup, setTodoGroupOrder } from '$lib/server/db';

export async function GET() {
	return json({ groups: listTodoGroups() });
}

export async function POST({ request }) {
	const body = await request.json();
	const group = createTodoGroup(String(body?.name ?? ''));
	if (!group) return json({ error: 'empty group name' }, { status: 400 });
	return json({ group }, { status: 201 });
}

/** Reorder: the client sends the full ordered id list. */
export async function PUT({ request }) {
	const body = await request.json();
	if (!Array.isArray(body?.ids)) return json({ error: 'ids must be an array' }, { status: 400 });
	setTodoGroupOrder(body.ids.filter((x: unknown) => typeof x === 'string'));
	return json({ groups: listTodoGroups() });
}
