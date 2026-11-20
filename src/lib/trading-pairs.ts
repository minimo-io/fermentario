/** Ripio trades a coin against a stablecoin: its only Bitcoin market is
 *  `BTC_USDC`, quoted in dollars. The journal keeps the venue pair as the
 *  ticker; the screens name the coin, because a Ripio order buys BTC, not a
 *  pair. B3 tickers pass through unchanged. */
const RIPIO_QUOTE = '_USDC';

/** Screen label → the ticker the journal stores. */
export function venuePair(ticker: string, orgId: string): string {
	const t = ticker.trim().toUpperCase();
	if (!t || orgId !== 'ripio') return t;
	return t.includes('_') ? t : `${t}${RIPIO_QUOTE}`;
}

/** Stored ticker → the label a Ripio screen shows. */
export function coinLabel(ticker: string, orgId: string): string {
	const t = ticker.trim().toUpperCase();
	if (orgId !== 'ripio') return t;
	return t.endsWith(RIPIO_QUOTE) ? t.slice(0, -RIPIO_QUOTE.length) : t;
}
