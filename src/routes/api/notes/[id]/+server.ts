import { json } from '@sveltejs/kit';
import { deleteNote, getNote, setNoteTags, setNoteFeatured, setNoteVideo, updateNote } from '$lib/server/db';
import { indexNote } from '$lib/server/rag';
import { tagNote } from '$lib/server/tags';
import { splitTrailingHashtags } from '$lib/hashtags';
import { extractYouTubeId } from '$lib/youtube';

export async function GET({ params }) {
	const note = getNote(params.id);
	if (!note) return json({ error: 'not found' }, { status: 404 });
	return json({ note });
}

export async function PATCH({ params, request }) {
	let body: { content?: unknown; featured?: unknown; video?: unknown };
	try {
		body = await request.json();
	} catch {
		return json({ error: 'invalid body' }, { status: 400 });
	}
	// Pinning and video touch only their own columns: no text, FTS, vector,
	// or tag work.
	if (typeof body?.content !== 'string' && (typeof body?.featured === 'boolean' || typeof body?.video === 'string')) {
		let note = getNote(params.id);
		if (!note) return json({ error: 'not found' }, { status: 404 });
		if (typeof body.featured === 'boolean') note = setNoteFeatured(params.id, body.featured) ?? note;
		if (typeof body.video === 'string') {
			const raw = body.video.trim();
			if (raw) {
				const id = extractYouTubeId(raw);
				if (!id) return json({ error: 'not a YouTube URL' }, { status: 400 });
				note = setNoteVideo(params.id, id) ?? note;
			} else {
				note = setNoteVideo(params.id, '') ?? note;
			}
		}
		return json({ note });
	}
	let raw = '';
	try {
		raw = String(body?.content ?? '').trim();
	} catch {
		return json({ error: 'invalid body' }, { status: 400 });
	}
	if (!raw) return json({ error: 'empty note' }, { status: 400 });
	const { content, tags } = splitTrailingHashtags(raw);
	if (!content) return json({ error: 'empty note' }, { status: 400 });

	const note = updateNote(params.id, content);
	if (!note) return json({ error: 'not found' }, { status: 404 });

	if (typeof body?.video === 'string') {
		const raw = body.video.trim();
		if (raw) {
			const id = extractYouTubeId(raw);
			if (!id) return json({ error: 'not a YouTube URL' }, { status: 400 });
			setNoteVideo(note.id, id);
			note.video = id;
		} else {
			setNoteVideo(note.id, '');
			note.video = '';
		}
	}

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
