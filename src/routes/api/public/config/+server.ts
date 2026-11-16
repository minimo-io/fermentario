import { json } from '@sveltejs/kit';
import { getPublicConfig } from '$lib/server/db';

/** Safe public settings for the anonymous homepage. */
export async function GET() {
	return json({ publicConfig: getPublicConfig() });
}
