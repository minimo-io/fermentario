/** Memoized weekly recap and its per-key in-flight guards.
 *
 *  Lives outside the route so /api/import can clear it after restoring a
 *  database: a recap memoized before the import would otherwise be served for
 *  the restored week. */

import { onJournalChange } from './journal-events';

let cache: { key: string; text: string } | null = null;

export const summaryLocks: Record<string, Promise<string> | undefined> = {};

onJournalChange(() => {
	cache = null;
	for (const key of Object.keys(summaryLocks)) delete summaryLocks[key];
});

export function getCachedSummary(key: string): string | null {
	return cache?.key === key ? cache.text : null;
}

export function setCachedSummary(key: string, text: string): void {
	cache = { key, text };
}

export function resetSummaryCache(): void {
	cache = null;
}
