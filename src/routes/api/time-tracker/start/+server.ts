import { json } from '@sveltejs/kit';
import { startTimeEntry } from '$lib/server/db';

export async function POST({ request }) {
	const body = await request.json().catch(() => ({}));
	const result = startTimeEntry(body?.comment ?? '');
	if (!result.ok) {
		return json({ error: result.error }, { status: 409 });
	}
	return json({ entry: result.entry }, { status: 201 });
}
