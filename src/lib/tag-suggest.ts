import { TAG_TOKEN } from '$lib/hashtags';
import type { TagCount } from '$lib/tag-cloud';

const TAIL_RE = /^(\s*#[^\s#]*)?\s*$/u;
const TOKEN_TAIL_RE = /^[\p{L}\p{N}_-]{0,29}/u;

/** Find a `#tag` token under the caret that the save path would store.
 *  Only a token in the trailing hashtag run counts: prose `#` never opens
 *  the menu, because saving would not store it. Returns the `#` start, the
 *  typed query (lowercase) and the token end. */
export function tagQueryAt(
	value: string,
	caret: number
): { start: number; query: string; end: number } | null {
	const clamped = Math.max(0, Math.min(caret, value.length));
	const before = value.slice(0, clamped);
	const m = /(?:^|\s)#([^\s#]{0,30})$/.exec(before);
	if (!m) return null;
	const typed = m[1] ?? '';
	// A bare `#` opens the menu with the top tags; anything else must be a
	// tag prefix so the menu never offers what the parser would reject.
	if (typed !== '' && !TAG_TOKEN.test(typed.toLowerCase())) {
		// Allow a mid-token caret: `#Te` + `st` still reads as `test`.
		const tail = value.slice(clamped);
		const rest = (tail.match(TOKEN_TAIL_RE) ?? [''])[0];
		if (!TAG_TOKEN.test((typed + rest).toLowerCase())) return null;
	}
	const tail = value.slice(clamped);
	const rest = (tail.match(TOKEN_TAIL_RE) ?? [''])[0];
	const full = (typed + rest).toLowerCase();
	if (full !== '' && !TAG_TOKEN.test(full)) return null;
	const tailRest = tail.slice(rest.length);
	if (!TAIL_RE.test(tailRest)) return null;
	const start = before.length - (typed.length + 1);
	return { start, query: typed.toLowerCase(), end: clamped + rest.length };
}

/** Splice the picked tag over the open `#query` token. */
export function insertTag(value: string, caret: number, tag: string): { value: string; caret: number } {
	const q = tagQueryAt(value, caret);
	if (!q) return { value, caret };
	const head = value.slice(0, q.start);
	const tail = value.slice(q.end);
	const insert = `#${tag}`;
	return { value: head + insert + tail, caret: head.length + insert.length };
}

let cached: TagCount[] | null = null;
let cachedAt = 0;
let inflight: Promise<TagCount[]> | null = null;
const TTL_MS = 30_000;

/** Tags in use across notes, tasks and principles. Cached briefly so every
 *  keystroke does not refetch; the save path stays the source of truth. */
export function loadTagChoices(): Promise<TagCount[]> {
	if (cached && Date.now() - cachedAt < TTL_MS) return Promise.resolve(cached);
	if (inflight) return inflight;
	inflight = (async () => {
		try {
			const res = await fetch('/api/tag-cloud');
			if (!res.ok) throw new Error('tag cloud failed');
			const d = (await res.json()) as { tags?: TagCount[] };
			cached = Array.isArray(d.tags) ? d.tags : [];
			cachedAt = Date.now();
			return cached;
		} catch {
			return cached ?? [];
		} finally {
			inflight = null;
		}
	})();
	return inflight;
}

/** Drop the cached cloud after a save so the next `#` sees the new tag. */
export function invalidateTagChoices(): void {
	cached = null;
	cachedAt = 0;
}
