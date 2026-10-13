import { json } from '@sveltejs/kit';
import {
	createNote,
	listNotesPage,
	countNotes,
	countNotesByTag,
	setNoteTags,
	setNoteVideo
} from '$lib/server/db';
import { ensureIndexed, indexNote } from '$lib/server/rag';
import { ensureTags, tagNote } from '$lib/server/tags';
import { splitTrailingHashtags } from '$lib/hashtags';
import { extractYouTubeId } from '$lib/youtube';

const MAX_TAG_FILTER = 60;

function num(value: string | null): number | null {
	if (value === null || value.trim() === '') return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

export async function GET({ url }) {
	const limit = num(url.searchParams.get('limit')) ?? 50;
	const before = num(url.searchParams.get('before'));
	const beforeId = url.searchParams.get('before_id');
	const rawTag = (url.searchParams.get('tag') ?? '').trim().toLowerCase();
	const rawFeatured = url.searchParams.get('featured');
	const featured = rawFeatured === 'only' || rawFeatured === 'exclude' ? rawFeatured : undefined;

	if (rawTag) {
		// A tag page is already filtered: the background passes would only burn
		// CPU, and every page of the cursor is filtered on the server.
		const tag = rawTag.slice(0, MAX_TAG_FILTER);
		const page = listNotesPage({ limit, before, beforeId, tag, featured });
		return json({ ...page, count: countNotesByTag(tag), tag });
	}

	// Neither pass may delay the list: embedding and model tagging run in the
	// background and land in the next response.
	void ensureIndexed().catch(() => {});
	void ensureTags();
	const page = listNotesPage({ limit, before, beforeId, featured });
	return json({ ...page, count: countNotes(), tag: null });
}

export async function POST({ request }) {
	const body = await request.json();
	const raw = String(body?.content ?? '').trim();
	if (!raw) {
		return json({ error: 'empty note' }, { status: 400 });
	}
	const { content, tags } = splitTrailingHashtags(raw);
	if (!content) {
		return json({ error: 'empty note' }, { status: 400 });
	}
	const created = Number(body?.created_at) || Date.now();
	const note = createNote(content, created);
	if (typeof body?.video === 'string' && body.video.trim()) {
		const id = extractYouTubeId(body.video);
		if (!id) return json({ error: 'not a YouTube URL' }, { status: 400 });
		setNoteVideo(note.id, id);
		note.video = id;
	}
	void indexNote(note.id, content).catch(() => {});
	if (tags.length > 0) {
		// The user typed the tags. They are the tags; the model is not asked.
		setNoteTags(note.id, tags);
		note.tags = tags;
	} else {
		// best-effort tags — never fails the note creation
		void tagNote(note.id, content)
			.then((generated) => {
				if (generated.length > 0) note.tags = generated;
			})
			.catch(() => {});
	}
	return json({ note }, { status: 201 });
}
