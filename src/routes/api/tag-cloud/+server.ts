import { json } from '@sveltejs/kit';
import { listTagCounts } from '$lib/server/db';

export async function GET() {
	return json({ tags: listTagCounts() }, { headers: { 'cache-control': 'no-store' } });
}
