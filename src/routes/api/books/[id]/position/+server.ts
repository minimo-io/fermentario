import { json } from '@sveltejs/kit';
import { setBookPosition } from '$lib/server/db';

/** Save the reader position: CFI anchor plus display percentage/chapter. */
export async function PUT({ params, request }) {
	const body = await request.json().catch(() => ({}));
	const book = setBookPosition(params.id, {
		cfi: body?.cfi,
		pct: body?.pct,
		chapter: body?.chapter
	});
	if (!book) return json({ error: 'not found' }, { status: 404 });
	return json({ book });
}
