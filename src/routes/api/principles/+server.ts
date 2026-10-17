import { json } from '@sveltejs/kit';
import { listPrinciples, createPrinciple, setPrincipleOrder, setPrincipleTags, setPrincipleVideo, listPrinciplesByTag } from '$lib/server/db';
import { splitTrailingHashtags } from '$lib/hashtags';
import { extractYouTubeId } from '$lib/youtube';

export async function GET({ url }) {
	const tag = (url.searchParams.get('tag') ?? '').trim().toLowerCase().slice(0, 60);
	if (tag) return json({ principles: listPrinciplesByTag(tag), tag });
	return json({ principles: listPrinciples() });
}

export async function POST({ request }) {
	const body = await request.json();
	// Same tag system as notes: trailing hashtags become the principle's tags.
	const { content, tags } = splitTrailingHashtags(String(body?.content ?? ''));
	if (!content.trim()) return json({ error: 'empty principle' }, { status: 400 });
	// Validate the video before creating anything: a bad URL must not leave a
	// principle behind while the client sees an error.
	let videoId = '';
	if (typeof body?.video === 'string' && body.video.trim()) {
		const id = extractYouTubeId(body.video);
		if (!id) return json({ error: 'not a YouTube URL' }, { status: 400 });
		videoId = id;
	}
	const p = createPrinciple(content);
	if (!p) return json({ error: 'empty principle' }, { status: 400 });
	if (tags.length > 0) {
		setPrincipleTags(p.id, tags);
		p.tags = tags;
	}
	if (videoId) {
		setPrincipleVideo(p.id, videoId);
		p.video = videoId;
	}
	return json({ principle: p }, { status: 201 });
}

/** Reorder: the client sends the full ordered id list. */
export async function PUT({ request }) {
	const body = await request.json();
	if (!Array.isArray(body?.ids)) return json({ error: 'ids must be an array' }, { status: 400 });
	setPrincipleOrder(body.ids.filter((x: unknown) => typeof x === 'string'));
	return json({ principles: listPrinciples() });
}
