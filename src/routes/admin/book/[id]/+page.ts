import { error } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, fetch }) => {
	const res = await fetch(`/api/books/${encodeURIComponent(params.id)}`);
	if (!res.ok) throw error(404, 'Book not found');
	const { book } = await res.json();
	const nres = await fetch(`/api/books/${encodeURIComponent(params.id)}/notes?limit=50`);
	const notesPage = nres.ok
		? await nres.json()
		: { notes: [], hasMore: false, nextCursor: null, total: 0 };
	return { book, notesPage };
};
