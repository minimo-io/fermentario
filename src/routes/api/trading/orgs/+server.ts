import { json } from '@sveltejs/kit';
import { listTradingOrgs } from '$lib/server/db';

/** Swing-trading venues and their editable cost rules. */
export async function GET() {
	return json({ orgs: listTradingOrgs() });
}
