import { getPublicConfig } from '$lib/server/db';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	return { publicConfig: getPublicConfig() };
};
