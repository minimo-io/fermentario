/** One strict decimal parser for every money/quantity field in the app.
 *
 *  Digits with at most one comma or dot as the decimal mark: both `38.50`
 *  and `38,50` parse to 38.5. Everything else — thousands (`1.234,56`),
 *  mixed marks, letters, blanks inside, empty — is NaN and hits the form's
 *  error path. Never guess: a misread price is worse than a rejected one.
 *  Range checks (no negatives, caps) stay with the caller and the server. */
export function parseDecimal(raw: unknown): number {
	if (typeof raw === 'number') return raw;
	const s = String(raw ?? '').trim();
	if (s === '' || /\s/.test(s)) return NaN;
	if (!/^[+-]?\d+([.,]\d+)?$/.test(s)) return NaN;
	return Number(s.replace(',', '.'));
}
