import { error } from '@sveltejs/kit';
import { getNote, getPublicConfig, listNoteComments } from '$lib/server/db';
import type { PageServerLoad } from './$types';

/** Server-rendered public note: published notes only, drafts 404. */
export const load: PageServerLoad = async ({ params, url }) => {
	const publicConfig = getPublicConfig();
	const note = getNote(params.id);
	if (!publicConfig.notesEnabled || !note || !note.published) throw error(404, 'Note not found');
	return { note, comments: listNoteComments(note.id), origin: url.origin, publicConfig };
};
