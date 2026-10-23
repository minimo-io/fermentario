import type { PageLoad } from './$types';
import type { TagCount } from '$lib/tag-cloud';

export const load: PageLoad = async ({ fetch }) => {
	try {
		const res = await fetch('/api/tag-cloud');
		if (!res.ok) return { tags: [] as TagCount[], error: true };
		const d = (await res.json()) as { tags?: TagCount[] };
		return { tags: Array.isArray(d.tags) ? d.tags : [], error: false };
	} catch {
		return { tags: [] as TagCount[], error: true };
	}
};
