import { json } from '@sveltejs/kit';
import { getNote, removeNoteTag } from '$lib/server/db';

/** Remove a single tag from a note.
 *
 *  A sub-resource rather than a field on PATCH /api/notes/[id], because removing
 *  a tag must not touch the note text, its FTS row or its vector. */
export async function DELETE({ params }) {
	if (!getNote(params.id)) return json({ error: 'not found' }, { status: 404 });
	if (!removeNoteTag(params.id, params.tag)) {
		return json({ error: 'tag not found on this note' }, { status: 404 });
	}
	return json({ ok: true, tag: params.tag.trim().toLowerCase() });
}
