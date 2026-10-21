/**
 * A tiny change signal for journal-scoped caches.
 *
 * `journal-store` cannot import the RAG, tagging or summary modules: they all
 * import the database facade, which would make a cycle. They subscribe here
 * instead and clear their per-journal state when the active journal changes or
 * is restored.
 */

type Listener = (journalId: string | null) => void;

const listeners = new Set<Listener>();

export function onJournalChange(fn: Listener): () => void {
	listeners.add(fn);
	return () => listeners.delete(fn);
}

export function emitJournalChange(journalId: string | null): void {
	for (const fn of listeners) {
		try {
			fn(journalId);
		} catch (err) {
			console.error('Journal change listener failed:', err);
		}
	}
}
