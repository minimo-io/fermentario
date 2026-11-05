/** Currency display rule, one place. `Intl` with `style: 'currency'` does
 *  not give stable symbols for this project: `es-UY` renders UYU as `$`,
 *  the same glyph as USD. Own the symbol instead, and let the locale format
 *  only the number.
 *
 *  USD `$1,234.56` · BRL `R$ 1.234,56` · UYU `$U 9.732,00`
 */

const FORMAT: Record<string, { symbol: string; locale: string; spaced: boolean }> = {
	USD: { symbol: '$', locale: 'en-US', spaced: false },
	BRL: { symbol: 'R$', locale: 'pt-BR', spaced: true },
	UYU: { symbol: '$U', locale: 'es-UY', spaced: true }
};

/** Format a money value with the project's fixed symbol. `decimals` is
 *  explicit: 0 for totals and goals, 2 for holdings and trades. Unknown
 *  currencies use their ISO code and English grouping. */
export function fmtCurrency(value: number, currency: string, decimals = 0): string {
	if (!Number.isFinite(value)) return '—';
	const code = currency.trim().toUpperCase();
	const meta = FORMAT[code] ?? { symbol: code, locale: 'en-US', spaced: true };
	const digits = Math.max(0, Math.trunc(decimals));
	const number = new Intl.NumberFormat(meta.locale, {
		minimumFractionDigits: digits,
		maximumFractionDigits: digits
	}).format(Math.abs(value));
	const sign = value < 0 ? '-' : '';
	return `${sign}${meta.symbol}${meta.spaced ? ' ' : ''}${number}`;
}
