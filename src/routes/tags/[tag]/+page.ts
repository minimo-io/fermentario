import type { PageLoad } from './$types';
import type { Note } from '$lib/types';
import { PAGE_SIZE } from '$lib/note-pager.svelte';

export const load: PageLoad = async ({ params, fetch, depends }) => {
	depends('app:notes');
	const tag = decodeURIComponent(params.tag).trim().toLowerCase().slice(0, 60);
	const res = await fetch(`/api/notes?limit=${PAGE_SIZE}&tag=${encodeURIComponent(tag)}`);
	if (!res.ok) {
		return { tag, notes: [] as Note[], count: 0, hasMore: false, nextCursor: null };
	}
	const d = await res.json();
	return {
		tag,
		notes: (d.notes ?? []) as Note[],
		count: d.count ?? 0,
		hasMore: !!d.hasMore,
		nextCursor: d.nextCursor ?? null
	};
};
