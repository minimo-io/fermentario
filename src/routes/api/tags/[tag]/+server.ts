import { json } from '@sveltejs/kit';
import { setTagColor } from '$lib/server/db';
import { isTagColorKey } from '$lib/tag-palette';

export async function PUT({ params, request }) {
	const body = await request.json();
	if (!isTagColorKey(body?.color)) return json({ error: 'unknown color' }, { status: 400 });
	setTagColor(params.tag, body.color);
	return json({ tag: params.tag.trim().toLowerCase(), color: body.color });
}
