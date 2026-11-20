/** The admin reminder card. One plain-text message, kept in the journal so it
 *  follows the user across devices. Line breaks are meaningful; whitespace at
 *  the edges is not. */
export const MOTTO_MAX = 500;

export function sanitizeMotto(value: unknown): string {
	if (typeof value !== 'string') return '';
	return value.replace(/\r\n?/g, '\n').trim().slice(0, MOTTO_MAX);
}
