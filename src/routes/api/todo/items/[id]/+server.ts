import { json } from '@sveltejs/kit';
import { getTodoItem, updateTodoItem, deleteTodoItem, setTodoItemTags } from '$lib/server/db';
import { splitTrailingHashtags } from '$lib/hashtags';
import { splitLeadingSubgroup } from '$lib/subgroups';

export async function GET({ params }) {
	const item = getTodoItem(params.id);
	if (!item) return json({ error: 'item not found' }, { status: 404 });
	return json({ item });
}

export async function PATCH({ params, request }) {
	const body = await request.json();
	if (!getTodoItem(params.id)) return json({ error: 'item not found' }, { status: 404 });
	const patch: { content?: string; done?: boolean; inProgress?: boolean; subgroup?: string; group_id?: string } = {};
	// Editing text re-parses trailing hashtags, exactly like notes, and a
	// leading (subgroup) moves the item (empty prefix clears it).
	if (typeof body?.content === 'string') {
		const { content, tags } = splitTrailingHashtags(body.content);
		const group = splitLeadingSubgroup(content);
		if (!group.content.trim()) return json({ error: 'empty item' }, { status: 400 });
		patch.content = group.content;
		patch.subgroup = group.subgroup;
		setTodoItemTags(params.id, tags);
	}
	if (typeof body?.done === 'boolean') patch.done = body.done;
	if (typeof body?.inProgress === 'boolean') patch.inProgress = body.inProgress;
	if (typeof body?.group_id === 'string' && body.group_id) patch.group_id = body.group_id;
	const item = updateTodoItem(params.id, patch);
	if (!item) return json({ error: 'item not found or bad group' }, { status: 404 });
	return json({ item });
}

export async function DELETE({ params }) {
	if (!getTodoItem(params.id)) return json({ error: 'item not found' }, { status: 404 });
	deleteTodoItem(params.id);
	return json({ ok: true });
}
