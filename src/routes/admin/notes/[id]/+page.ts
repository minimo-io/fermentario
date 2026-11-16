import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';
import type { Note, NoteComment } from '$lib/types';

export const load: PageLoad = async ({ params, fetch }) => {
	const res = await fetch(`/api/notes/${encodeURIComponent(params.id)}`);
	if (!res.ok) throw error(404, 'Note not found');
	const d = await res.json();
	const cres = await fetch(`/api/notes/${encodeURIComponent(params.id)}/comments`);
	const comments = cres.ok ? (((await cres.json()).comments as NoteComment[]) ?? []) : ([] as NoteComment[]);
	return { note: d.note as Note, comments };
};
