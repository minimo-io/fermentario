import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import type { Note } from '$lib/types';

export const load: PageLoad = async ({ params, fetch }) => {
	const res = await fetch(`/api/notes/${encodeURIComponent(params.id)}`);
	if (!res.ok) throw error(404, 'Note not found');
	const d = await res.json();
	return { note: d.note as Note };
};
