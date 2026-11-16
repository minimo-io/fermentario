import { json } from '@sveltejs/kit';
import { getPublicConfig, listNotesPage } from '$lib/server/db';

function num(value: string | null): number | null {
	if (value === null || value.trim() === '') return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

/** Public feed: published notes only, newest first. No auth yet. */
export async function GET({ url }) {
	const publicConfig = getPublicConfig();
	if (!publicConfig.notesEnabled) return json({ notes: [], hasMore: false, nextCursor: null });
	const limit = num(url.searchParams.get('limit')) ?? 50;
	const before = num(url.searchParams.get('before'));
	const beforeId = url.searchParams.get('before_id');
	const page = listNotesPage({ limit, before, beforeId, published: 'only' });
	return json(page);
}
