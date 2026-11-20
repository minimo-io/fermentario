import { json } from '@sveltejs/kit';
import { getRunningTimeEntry, listTimeEntries, listTimeEntriesByTag } from '$lib/server/db';

export async function GET({ url }) {
	const tag = url.searchParams.get('tag')?.trim().toLowerCase();
	if (tag) return json({ entries: listTimeEntriesByTag(tag, 200) });
	const entries = listTimeEntries(200);
	return json({ running: getRunningTimeEntry(), entries });
}
