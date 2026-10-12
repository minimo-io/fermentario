import type { PageLoad } from './$types';

export const load: PageLoad = async ({ fetch }) => {
	const res = await fetch('/api/stats/heatmap');
	if (!res.ok) return { days: [] as { day: string; count: number }[], notes: 0 };
	const d = await res.json();
	return {
		days: (d.days ?? []) as { day: string; count: number }[],
		notes: d.notes ?? 0
	};
};
