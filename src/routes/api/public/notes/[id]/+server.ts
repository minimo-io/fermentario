import { json } from '@sveltejs/kit';
import { getNote, getPublicConfig, listNoteComments } from '$lib/server/db';

/** Public note detail: published notes only. Drafts answer 404. */
export async function GET({ params }) {
	const publicConfig = getPublicConfig();
	const note = getNote(params.id);
	if (!publicConfig.notesEnabled || !note || !note.published) return json({ error: 'not found' }, { status: 404 });
	const comments = listNoteComments(note.id);
	return json({ note, comments, publicConfig });
}
