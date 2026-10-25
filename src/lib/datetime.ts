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
