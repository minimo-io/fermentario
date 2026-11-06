import { json } from '@sveltejs/kit';
import { listStockRegistries } from '$lib/server/db';

/** Every brand and category already used by a stock item. The item form
 *  filters this list as you type and creates new names on save. */
export async function GET() {
	return json(listStockRegistries());
}
