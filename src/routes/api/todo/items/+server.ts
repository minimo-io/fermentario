import { json } from '@sveltejs/kit';
import { listTodoItemsByTag, listInProgressItems, listDoneItems } from '$lib/server/db';

/** To-Do items carrying a tag, for the tag route's To-Do group. */
export async function GET({ url }) {
	if (url.searchParams.get('inprogress') === 'only') {
		return json({ items: listInProgressItems() });
	}
	if (url.searchParams.get('done') === 'only') {
		const rawLimit = Number(url.searchParams.get('limit'));
		const limit = Number.isFinite(rawLimit) ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100) : 50;
		const beforeRaw = url.searchParams.get('before');
		const before = beforeRaw === null ? Number.NaN : Number(beforeRaw);
		const beforeId = (url.searchParams.get('before_id') ?? '').trim();
		const cursor = Number.isFinite(before) && before >= 0 && beforeId ? { done_at: before, id: beforeId } : null;
		return json(listDoneItems(limit, cursor));
	}
	const tag = (url.searchParams.get('tag') ?? '').trim().toLowerCase().slice(0, 60);
	if (!tag) return json({ items: [] });
	return json({ items: listTodoItemsByTag(tag), tag });
}
