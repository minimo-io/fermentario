import { json } from '@sveltejs/kit';
import { listTagColors } from '$lib/server/db';

export async function GET() {
	return json({ colors: listTagColors() });
}
