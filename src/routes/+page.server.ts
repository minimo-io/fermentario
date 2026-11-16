import { getPublicConfig, listNotesPage } from '$lib/server/db';
import type { PageServerLoad } from './$types';

/** Server-rendered public feed: published notes only, so crawlers see HTML. */
export const load: PageServerLoad = async ({ url }) => {
	const publicConfig = getPublicConfig();
	const page = publicConfig.notesEnabled
		? listNotesPage({ limit: 50, published: 'only' })
		: { notes: [], hasMore: false, nextCursor: null };
	return { notes: page.notes, hasMore: page.hasMore, nextCursor: page.nextCursor, origin: url.origin, publicConfig };
};
