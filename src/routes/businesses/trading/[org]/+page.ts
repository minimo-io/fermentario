import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
	throw redirect(307, `/admin/businesses/trading/${encodeURIComponent(params.org)}`);
};
