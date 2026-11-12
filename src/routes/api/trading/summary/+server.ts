import { json } from '@sveltejs/kit';
import { getTradingSummary, refreshTradingQuotes, listTradingOrders } from '$lib/server/db';

/** Full panel for one venue: diary with sale profits, open positions with
 *  quotes, and the rolling monthly exemption panel. `refresh=1` fetches
 *  fresh quotes for the open tickers through the shared quote path. */
export async function GET({ url }) {
	const org = String(url.searchParams.get('org') ?? 'b3');
	if (url.searchParams.get('refresh') === '1') {
		try {
			const tickers = [...new Set(listTradingOrders(org).map((o) => o.ticker))];
			await refreshTradingQuotes(tickers);
		} catch (e) {
			const summary = getTradingSummary(org);
			if (!summary) return json({ error: 'unknown organization' }, { status: 404 });
			return json({ summary, error: (e as Error)?.message ?? 'quotes unavailable' });
		}
	}
	const summary = getTradingSummary(org);
	if (!summary) return json({ error: 'unknown organization' }, { status: 404 });
	return json({ summary });
}
