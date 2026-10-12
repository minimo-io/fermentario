import { allVectors, notesBetween, ftsCandidateIds, setVector, getNote, notesMissingVectors, countNotes } from './db';
import { embed, cosine } from './models';
import type { Note } from './db';

let indexing: Promise<void> | null = null;

/**
 * Compute embeddings for any notes missing one. Runs once lazily.
 */
export function ensureIndexed(): Promise<void> {
	if (!indexing) {
		indexing = (async () => {
			// Anti-join in SQL: a batch of ids, not the whole table plus every
			// vector blob. The cost per call stays constant as the journal grows.
			for (const id of notesMissingVectors(25)) {
				const note = getNote(id);
				if (note) setVector(id, await embed(note.content));
			}
		})().finally(() => {
			// Reset on success too: the pass is a cache check, not a one-time
			// job. Caching the resolved promise left every note created while
			// the server was running without a vector.
			indexing = null;
		});
	}
	return indexing;
}

export async function indexNote(noteId: string, content: string): Promise<void> {
	setVector(noteId, await embed(content));
}

export interface Retrieved {
	note: Note;
	score: number;
}

/**
 * Hybrid retrieval: cosine similarity over all note vectors, boosted by FTS5 BM25.
 * `since` (ms epoch) restricts the candidate window to recent notes.
 */
export async function retrieve(
	query: string,
	opts: { topK?: number; since?: number } = {}
): Promise<Retrieved[]> {
	const topK = opts.topK ?? 6;
	const vectors = allVectors();

	let candidates: { noteId: string; vector: Float32Array }[];
	if (opts.since !== undefined) {
		const window = notesBetween(opts.since, Number.MAX_SAFE_INTEGER);
		const ids = new Set(window.map((n) => n.id));
		candidates = vectors.filter((v) => ids.has(v.noteId));
	} else {
		candidates = vectors;
	}

	if (candidates.length === 0) return [];

	const q = await embed(query);
	const scored = candidates.map((c) => ({ noteId: c.noteId, cos: cosine(q, c.vector) }));

	const ftsMap = new Map<string, number>();
	if (query.length > 2) {
		for (const hit of ftsCandidateIds(query)) {
			ftsMap.set(hit.noteId, hit.bm25);
		}
	}
	const maxFts = ftsMap.size ? Math.max(...ftsMap.values()) : 0;

	const merged = scored.map((s) => {
		const bm = (ftsMap.get(s.noteId) ?? 0) / (maxFts || 1);
		return { noteId: s.noteId, score: 0.6 * s.cos + 0.4 * bm };
	});

	merged.sort((a, b) => b.score - a.score);
	const top = merged.slice(0, topK);

	return top.flatMap((t) => {
		const note = getNote(t.noteId);
		return note ? [{ note, score: t.score }] : [];
	});
}

/** Build the retrieval-augmented context string handed to the LLM. */
export function contextFor(retrieved: Retrieved[]): string {
	return retrieved
		.map((r, i) => {
			const d = new Date(r.note.created_at);
			const when = d.toLocaleString('en-GB', {
				day: 'numeric',
				month: 'short',
				year: 'numeric',
				hour: '2-digit',
				minute: '2-digit'
			});
			return `[${i + 1}] ${when}\n${r.note.content.trim()}`;
		})
		.join('\n\n');
}

export { countNotes };