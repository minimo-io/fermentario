import { getAdminConfig } from '$lib/server/db';

/** The reminder is server-loaded so the admin shell renders it on the first
 *  paint. Theme, width and language stay browser preferences. */
export function load() {
	return { adminConfig: getAdminConfig() };
}
