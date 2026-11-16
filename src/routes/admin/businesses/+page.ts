import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

/** Businesses always opens on Trading; Cubiq lives at /admin/businesses/cubiq. */
export const load: PageLoad = async () => {
	throw redirect(307, '/admin/businesses/trading/b3');
};
