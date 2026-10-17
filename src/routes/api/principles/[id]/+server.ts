import { json } from '@sveltejs/kit';
import { updatePrinciple, deletePrinciple, setPrincipleTags, setPrincipleVideo } from '$lib/server/db';
import { splitTrailingHashtags } from '$lib/hashtags';
import { extractYouTubeId } from '$lib/youtube';

export async function PATCH({ params, request }) {
	const body = await request.json();
	// Validate first: a bad URL must not half-save the edit.
	let nextVideo: string | null = null;
	if (typeof body?.video === 'string') {
		const raw = body.video.trim();
		if (raw) {
			const id = extractYouTubeId(raw);
			if (!id) return json({ error: 'not a YouTube URL' }, { status: 400 });
			nextVideo = id;
		} else {
			nextVideo = '';
		}
	}
	const { content, tags } = splitTrailingHashtags(String(body?.content ?? ''));
	if (!content.trim()) return json({ error: 'principle not found or empty' }, { status: 404 });
	const p = updatePrinciple(params.id, content);
	if (!p) return json({ error: 'principle not found or empty' }, { status: 404 });
	setPrincipleTags(params.id, tags);
	p.tags = tags;
	if (nextVideo !== null) {
		setPrincipleVideo(params.id, nextVideo);
		p.video = nextVideo;
	}
	return json({ principle: p });
}

export async function DELETE({ params }) {
	if (!deletePrinciple(params.id)) return json({ error: 'principle not found' }, { status: 404 });
	return json({ ok: true });
}
