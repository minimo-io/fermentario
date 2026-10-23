/** One hit from the global search palette.
 *
 *  `library` and `influences` are reserved for their future sections. No query
 *  returns them yet, so the palette never renders an empty group. */
export type SearchKind = 'note' | 'todo' | 'principle' | 'library' | 'influences';

export interface SearchHit {
	kind: SearchKind;
	id: string;
	/** One-line preview, clipped around the first match. */
	text: string;
	/** Extra line under the preview: task group and state. Empty elsewhere. */
	context: string;
	/** Sort timestamp: note/task update time, principle creation time. */
	at: number;
}

/** Results render in this order. Future kinds already have a slot. */
export const SEARCH_GROUPS: { kind: SearchKind; label: string }[] = [
	{ kind: 'note', label: 'Notes' },
	{ kind: 'todo', label: 'To-Do' },
	{ kind: 'principle', label: 'Principles' },
	{ kind: 'library', label: 'Library' },
	{ kind: 'influences', label: 'Influences' }
];

/** Deep link for a hit. Future sections return null until their routes exist. */
export function searchHref(hit: Pick<SearchHit, 'kind' | 'id'>): string | null {
	switch (hit.kind) {
		case 'note':
			return `/notes/${hit.id}`;
		case 'todo':
			return `/todo/${hit.id}`;
		case 'principle':
			return `/principles/${hit.id}`;
		default:
			return null;
	}
}
