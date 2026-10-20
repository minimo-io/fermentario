import type { PageLoad } from './$types';
import type { TodoDonePage } from '$lib/types';

const emptyDone: TodoDonePage = { items: [], count: 0, hasMore: false, nextCursor: null };

export const load: PageLoad = async ({ fetch }) => {
	const [res, doneRes] = await Promise.all([
		fetch('/api/stats/heatmap'),
		fetch('/api/todo/items?done=only&limit=50')
	]);
	const d = res.ok ? await res.json() : { days: [], notes: 0 };
	const done = doneRes.ok ? ((await doneRes.json()) as TodoDonePage) : emptyDone;
	return {
		days: (d.days ?? []) as { day: string; count: number }[],
		notes: d.notes ?? 0,
		done: {
			items: Array.isArray(done.items) ? done.items : [],
			count: done.count ?? 0,
			hasMore: !!done.hasMore,
			nextCursor: done.nextCursor ?? null
		}
	};
};
