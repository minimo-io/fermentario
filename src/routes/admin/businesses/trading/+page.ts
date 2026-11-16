import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/** A bare /admin/businesses/trading always opens B3; Ripio lives next to it. */
export const load: PageLoad = async () => {
	throw redirect(307, '/admin/businesses/trading/b3');
};
