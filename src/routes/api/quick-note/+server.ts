import { json } from '@sveltejs/kit';
import { getQuickNote, setQuickNote } from '$lib/server/db';

/** The quick note mini app saves without a Save button, so this route stays a
 *  plain read/write pair on one row. */
export async function GET() {
	return json(getQuickNote());
}

export async function PUT({ request }) {
	const body = await request.json().catch(() => null);
	if (typeof body?.content !== 'string') {
		return json({ error: 'content must be a string' }, { status: 400 });
	}
	return json(setQuickNote(body.content));
}
