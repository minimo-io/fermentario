import { redirect } from '@sveltejs/kit';
import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params }) => {
	throw redirect(307, `/admin/principles/${encodeURIComponent(params.id)}`);
};
