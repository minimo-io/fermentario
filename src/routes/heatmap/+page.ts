import type { PageLoad } from './$types';
import type { TodoDonePage, TradeDay, TradeHistoryPage } from '$lib/types';

const emptyDone: TodoDonePage = { items: [], count: 0, hasMore: false, nextCursor: null };
const emptyTrades: TradeHistoryPage = { items: [], count: 0, hasMore: false, nextCursor: null };

export const load: PageLoad = async ({ fetch }) => {
	const [res, doneRes, tradesRes] = await Promise.all([
		fetch('/api/stats/heatmap'),
		fetch('/api/todo/items?done=only&limit=50'),
		fetch('/api/holdings/actions?limit=50')
	]);
	const d = res.ok ? await res.json() : { days: [], trades: [], notes: 0 };
	const done = doneRes.ok ? ((await doneRes.json()) as TodoDonePage) : emptyDone;
	const trades = tradesRes.ok ? ((await tradesRes.json()) as TradeHistoryPage) : emptyTrades;
	return {
		days: (d.days ?? []) as { day: string; count: number }[],
		trades: (d.trades ?? []) as TradeDay[],
		notes: d.notes ?? 0,
		done: {
			items: Array.isArray(done.items) ? done.items : [],
			count: done.count ?? 0,
			hasMore: !!done.hasMore,
			nextCursor: done.nextCursor ?? null
		},
		tradeHistory: {
			items: Array.isArray(trades.items) ? trades.items : [],
			count: trades.count ?? 0,
			hasMore: !!trades.hasMore,
			nextCursor: trades.nextCursor ?? null
		}
	};
};
