import { getPublicConfig } from '$lib/server/db';
import type { PageServerLoad } from './$types';

/** The tool page shows the shared public header, so it needs the site title. */
export const load: PageServerLoad = async () => {
	return { publicConfig: getPublicConfig() };
};
