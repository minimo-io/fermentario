import { json } from '@sveltejs/kit';
import { getLatestNote } from '$lib/server/db';

export function GET() {
	return json({ note: getLatestNote() });
}
