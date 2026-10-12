import { json } from '@sveltejs/kit';
import { listAsks } from '$lib/server/db';

export async function GET() {
	return json({ asks: listAsks() });
}