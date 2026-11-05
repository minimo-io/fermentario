/** Format a timestamp for `<input type="datetime-local">` in local time. */
export function datetimeLocalValue(ms: number): string {
	const d = new Date(ms);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parse a local `datetime-local` value. Empty or invalid input returns undefined. */
export function datetimeLocalTimestamp(value: string): number | undefined {
	if (!value) return undefined;
	const ms = new Date(value).getTime();
	return Number.isFinite(ms) ? ms : undefined;
}

/** Format a timestamp for `<input type="date">` in local time (YYYY-MM-DD). */
export function dateLocalValue(ms: number): string {
	const d = new Date(ms);
	const pad = (n: number) => String(n).padStart(2, '0');
	return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Parse a local `date` value at local noon, avoiding timezone day shifts.
 *  Empty or invalid input returns undefined. */
export function dateLocalTimestamp(value: string): number | undefined {
	if (!value) return undefined;
	const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
	if (!m) return undefined;
	const ms = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0).getTime();
	return Number.isFinite(ms) ? ms : undefined;
}
