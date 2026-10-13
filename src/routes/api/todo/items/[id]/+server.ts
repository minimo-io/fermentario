import { json } from '@sveltejs/kit';
import { getTodoItem, updateTodoItem, deleteTodoItem, setTodoItemTags } from '$lib/server/db';
import { splitTrailingHashtags } from '$lib/hashtags';

export async function PATCH({ params, request }) {
	const body = await request.json();
	if (!getTodoItem(params.id)) return json({ error: 'item not found' }, { status: 404 });
	const patch: { content?: string; done?: boolean } = {};
	// Editing text re-parses trailing hashtags, exactly like notes.
	if (typeof body?.content === 'string') {
		const { content, tags } = splitTrailingHashtags(body.content);
		if (!content.trim()) return json({ error: 'empty item' }, { status: 400 });
		patch.content = content;
		setTodoItemTags(params.id, tags);
	}
	if (typeof body?.done === 'boolean') patch.done = body.done;
	const item = updateTodoItem(params.id, patch);
	if (!item) return json({ error: 'item not found' }, { status: 404 });
	return json({ item });
}

export async function DELETE({ params }) {
	if (!getTodoItem(params.id)) return json({ error: 'item not found' }, { status: 404 });
	deleteTodoItem(params.id);
	return json({ ok: true });
}
