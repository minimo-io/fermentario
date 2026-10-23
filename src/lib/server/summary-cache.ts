/** Memoized weekly recap and its per-key in-flight guards.
 *
 *  Lives outside the route so /api/import can clear it after restoring a
 *  database: a recap memoized before the import would otherwise be served for
 *  the restored week. */

import { onJournalChange } from './journal-events';

let cache: { key: string; text: string } | null = null;
let epoch = 0;

export const summaryLocks: Record<string, Promise<string> | undefined> = {};

onJournalChange(() => {
	cache = null;
	epoch++;
	for (const key of Object.keys(summaryLocks)) delete summaryLocks[key];
});

/**
 * Changes whenever the active journal is replaced or restored. A generation
 * that started before the change must not write its recap into the new rows.
 */
export function getSummaryEpoch(): number {
	return epoch;
}

export function getCachedSummary(key: string): string | null {
	return cache?.key === key ? cache.text : null;
}

export function setCachedSummary(key: string, text: string): void {
	cache = { key, text };
}

export function resetSummaryCache(): void {
	cache = null;
}
