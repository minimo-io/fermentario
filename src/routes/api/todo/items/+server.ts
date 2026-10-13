import { json } from '@sveltejs/kit';
import { listTodoItemsByTag } from '$lib/server/db';

/** To-Do items carrying a tag, for the tag route's To-Do group. */
export async function GET({ url }) {
	const tag = (url.searchParams.get('tag') ?? '').trim().toLowerCase().slice(0, 60);
	if (!tag) return json({ items: [] });
	return json({ items: listTodoItemsByTag(tag), tag });
}
