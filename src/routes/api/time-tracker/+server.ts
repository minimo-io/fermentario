import { json } from '@sveltejs/kit';
import { getRunningTimeEntry, listTimeEntries } from '$lib/server/db';

export async function GET() {
	const entries = listTimeEntries(200);
	return json({ running: getRunningTimeEntry(), entries });
}
