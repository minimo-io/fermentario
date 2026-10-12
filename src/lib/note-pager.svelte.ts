import type { Note } from '$lib/types';

export const PAGE_SIZE = 50;

export interface NoteCursor {
	created_at: number;
	id: string;
}

export interface NotesPage {
	notes: Note[];
	count: number;
	hasMore: boolean;
	nextCursor: NoteCursor | null;
	tag: string | null;
}

/** Cursor-paged note list shared by the timeline and the tag pages.
 *
 *  Runes live in class fields, so this file carries the `.svelte.ts` suffix. */
export class NotePager {
	notes = $state<Note[]>([]);
	cursor = $state<NoteCursor | null>(null);
	hasMore = $state(false);
	count = $state(0);
	loading = $state(false);
	tag: string | null;

	constructor(tag: string | null = null) {
		this.tag = tag;
	}

	seed(page: NotesPage): void {
		if (page.tag !== undefined) this.tag = page.tag ?? this.tag;
		this.notes = page.notes;
		this.cursor = page.nextCursor;
		this.hasMore = page.hasMore;
		this.count = page.count;
	}

	private async request(before: NoteCursor | null): Promise<NotesPage> {
		const q = new URLSearchParams({ limit: String(PAGE_SIZE) });
		if (before) {
			q.set('before', String(before.created_at));
			q.set('before_id', before.id);
		}
		if (this.tag) q.set('tag', this.tag);
		const res = await fetch(`/api/notes?${q.toString()}`);
		if (!res.ok) throw new Error('Failed to load notes.');
		return (await res.json()) as NotesPage;
	}

	async open(): Promise<void> {
		this.loading = true;
		try {
			this.seed(await this.request(null));
		} finally {
			this.loading = false;
		}
	}

	async loadMore(): Promise<void> {
		if (this.loading || !this.hasMore || !this.cursor) return;
		this.loading = true;
		try {
			const page = await this.request(this.cursor);
			// A tag pager appends only matching notes, so a stale or mismatched
			// response can never mix unrelated notes into a tag page.
			const incoming = this.tag
				? page.notes.filter((n) => n.tags?.includes(this.tag as string))
				: page.notes;
			this.notes = [...this.notes, ...incoming];
			this.cursor = page.nextCursor;
			this.hasMore = page.hasMore && incoming.length > 0;
			this.count = page.count;
		} finally {
			this.loading = false;
		}
	}

	prepend(note: Note): void {
		this.notes = [note, ...this.notes];
		this.count += 1;
	}

	remove(id: string): void {
		if (!this.notes.some((n) => n.id === id)) return;
		this.notes = this.notes.filter((n) => n.id !== id);
		this.count = Math.max(0, this.count - 1);
	}

	patch(note: Note): void {
		this.notes = this.notes.map((n) => (n.id === note.id ? note : n));
	}

	/** Swap an entry that is still listed under a temporary id for the stored
	 *  note. The ids differ, so `patch` can never match an optimistic entry —
	 *  without this it keeps its `pending` flag forever. */
	replace(fromId: string, note: Note): void {
		this.notes = this.notes.map((n) => (n.id === fromId ? note : n));
	}

	hasTag(note: Note, tag = this.tag): boolean {
		return !!tag && !!note.tags?.includes(tag);
	}

	/** Quiet refresh of the first page: updates notes already on screen and
	 *  ignores the rest, so background model tags never collapse a long list. */
	async sync(): Promise<void> {
		const page = await this.request(null);
		const known = new Map(page.notes.map((n) => [n.id, n]));
		// A temp card the server does not know never reached storage: the POST
		// died mid-flight. Keep every other note untouched.
		this.notes = this.notes
			.filter((n) => known.has(n.id) || !(n.pending && n.id.startsWith('tmp-')))
			.map((n) => known.get(n.id) ?? n);
		this.count = page.count;
	}
}
