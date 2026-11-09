/** Client-side unique key for draft rows.
 *  `crypto.randomUUID` exists only in secure contexts (HTTPS or
 *  localhost). The app is also served over a plain LAN address, where it is
 *  undefined, so fall back to random bytes and finally to the clock. */
export function uniqueKey(): string {
	const box = globalThis.crypto;
	if (box && typeof box.randomUUID === 'function') return box.randomUUID();
	if (box && typeof box.getRandomValues === 'function') {
		const bytes = new Uint8Array(16);
		box.getRandomValues(bytes);
		return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
	}
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
