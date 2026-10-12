import { json } from '@sveltejs/kit';
import { deleteNote, setNoteTags, updateNote } from '$lib/server/db';
import { indexNote } from '$lib/server/rag';
import { tagNote } from '$lib/server/tags';
import { splitTrailingHashtags } from '$lib/hashtags';

export async function PATCH({ params, request }) {
	let raw = '';
	try {
		const body = await request.json();
		raw = String(body?.content ?? '').trim();
	} catch {
		return json({ error: 'invalid body' }, { status: 400 });
	}
	if (!raw) return json({ error: 'empty note' }, { status: 400 });
	const { content, tags } = splitTrailingHashtags(raw);
	if (!content) return json({ error: 'empty note' }, { status: 400 });

	const note = updateNote(params.id, content);
	if (!note) return json({ error: 'not found' }, { status: 404 });

	// The old vector and tags describe the previous text. Refresh both in the
	// background; clearing first means a later GET /api/notes retries tagging.
	// Neither step can fail the save.
	setNoteTags(note.id, []);
	note.tags = [];
	void indexNote(note.id, content).catch(() => {});
	if (tags.length > 0) {
		setNoteTags(note.id, tags);
		note.tags = tags;
	} else {
		void tagNote(note.id, content)
			.then((generated) => {
				if (generated.length > 0) note.tags = generated;
			})
			.catch(() => {});
	}

	return json({ note });
}

export async function DELETE({ params }) {
	const ok = deleteNote(params.id);
	if (!ok) return json({ error: 'not found' }, { status: 404 });
	return json({ ok: true });
}
