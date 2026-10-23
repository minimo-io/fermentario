import { json } from '@sveltejs/kit';
import { searchJournal } from '$lib/server/db';

const MAX_QUERY = 80;
const MAX_HITS_PER_KIND = 10;

export async function GET({ url }) {
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, MAX_QUERY);
	const hits = q.length < 2 ? [] : searchJournal(q, MAX_HITS_PER_KIND);
	return json({ q, hits }, { headers: { 'cache-control': 'no-store' } });
}
