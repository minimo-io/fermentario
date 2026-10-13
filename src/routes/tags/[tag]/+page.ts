import type { PageLoad } from './$types';
import type { Note, TodoItem } from '$lib/types';
import { PAGE_SIZE } from '$lib/note-pager.svelte';

export const load: PageLoad = async ({ params, fetch, depends }) => {
	depends('app:notes');
	const tag = decodeURIComponent(params.tag).trim().toLowerCase().slice(0, 60);
	const res = await fetch(`/api/notes?limit=${PAGE_SIZE}&tag=${encodeURIComponent(tag)}&featured=exclude`);
	if (!res.ok) {
		return { tag, notes: [] as Note[], pinned: [] as Note[], todoItems: [] as TodoItem[], count: 0, hasMore: false, nextCursor: null };
	}
	const d = await res.json();
	const pinnedRes = await fetch(`/api/notes?limit=100&tag=${encodeURIComponent(tag)}&featured=only`);
	const pinned = pinnedRes.ok ? (((await pinnedRes.json()).notes ?? []) as Note[]) : [];
	const todoRes = await fetch(`/api/todo/items?tag=${encodeURIComponent(tag)}`);
	const todoItems = todoRes.ok ? (((await todoRes.json()).items ?? []) as TodoItem[]) : [];
	return {
		tag,
		notes: (d.notes ?? []) as Note[],
		pinned,
		todoItems,
		count: d.count ?? 0,
		hasMore: !!d.hasMore,
		nextCursor: d.nextCursor ?? null
	};
};
