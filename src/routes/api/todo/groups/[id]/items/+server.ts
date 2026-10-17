import { json } from '@sveltejs/kit';
import { listTodoItems, createTodoItem, setTodoItemTags, setTodoItemOrder } from '$lib/server/db';
import { splitTrailingHashtags } from '$lib/hashtags';
import { splitLeadingSubgroup } from '$lib/subgroups';

export async function GET({ params }) {
	return json({ items: listTodoItems(params.id) });
}

/** Reorder: the client sends the full ordered id list for this group. */
export async function PUT({ params, request }) {
	const body = await request.json();
	if (!Array.isArray(body?.ids)) return json({ error: 'ids must be an array' }, { status: 400 });
	setTodoItemOrder(
		params.id,
		body.ids.filter((x: unknown) => typeof x === 'string')
	);
	return json({ items: listTodoItems(params.id) });
}

export async function POST({ params, request }) {
	const body = await request.json();
	const raw = String(body?.content ?? '').trim();
	if (!raw) return json({ error: 'empty item' }, { status: 400 });
	// Same tag system as notes: trailing hashtags become the item's tags.
	// A leading (subgroup) assigns the subgroup, creating it by naming it.
	const { content, tags } = splitTrailingHashtags(raw);
	if (!content) return json({ error: 'empty item' }, { status: 400 });
	const group = splitLeadingSubgroup(content);
	if (!group.content) return json({ error: 'empty item' }, { status: 400 });
	const item = createTodoItem(params.id, group.content, Number(body?.created_at) || Date.now(), group.subgroup);
	if (!item) return json({ error: 'group not found' }, { status: 404 });
	if (tags.length > 0) {
		setTodoItemTags(item.id, tags);
		item.tags = tags;
	}
	return json({ item }, { status: 201 });
}
