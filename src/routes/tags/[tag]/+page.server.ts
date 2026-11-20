import { getPublicConfig, listNotesPage, countPublishedNotesByTag } from '$lib/server/db';
import type { PageServerLoad } from './$types';

/** A public tag page: published notes only, server-rendered like the index.
 *  To-dos, principles and time entries are private, so this tag view has just
 *  the notes that carry the tag. */
export const load: PageServerLoad = async ({ params }) => {
	const publicConfig = getPublicConfig();
	const tag = decodeURIComponent(params.tag ?? '').trim().toLowerCase().slice(0, 60);
	if (!publicConfig.notesEnabled || !tag) {
		return { tag, notes: [], count: 0, hasMore: false, nextCursor: null, publicConfig };
	}
	const page = listNotesPage({ limit: 50, tag, published: 'only' });
	return {
		tag,
		notes: page.notes,
		count: countPublishedNotesByTag(tag),
		hasMore: page.hasMore,
		nextCursor: page.nextCursor,
		publicConfig
	};
};
