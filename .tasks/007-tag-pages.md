Status: [DONE]

# Tag pages

## Context
- Notes carry tags (task 001 model tags, task 004 hashtags from the note text) and Timeline renders them as chips, but the chips were inert text.
- A tag is the natural way to find a subset of a journal, and the timeline is capped at 500 notes (`listNotes(500)`), so filtering through it would hide older matches.

## Requirements
1. Every tag chip is a link to `/tags/<tag>`, so it can be opened in a new tab and works without JavaScript routing state.
2. A tag page lists every note carrying that tag, newest first, with no limit.
3. It reuses Timeline, so edit, delete, read-aloud and the chips themselves work there. Language for speech comes from the saved config in localStorage.
4. Delete and edit refresh the filtered list through `invalidateAll()`; a failed edit keeps the dialog open and shows an error.
5. `GET /api/notes?tag=x` returns the filtered list. A tag request skips the background embedding and tagging passes, because a filtered view does not need them.

## Acceptance criteria
- Clicking a chip opens `/tags/<tag>` and every note with that tag is listed, grouped by day like the main timeline.
- A tag with no notes shows an empty state, not an error.
- Non-ASCII tags work in the URL (`/tags/correrín`).
- `pnpm run check` prints 0 errors and 0 warnings.

## Progress

### 2026-09-23 — done
- `listNotesByTag(tag)` in db.ts joins note_tags and has no LIMIT; it reuses `withTags` so the chips of the cards are still present.
- `GET /api/notes` reads `?tag=`, lowercases and caps it at 60 chars, and returns `{ notes, count, tag }`. Without the parameter the endpoint behaves as before.
- New route `src/routes/tags/[tag]/+page.ts` (universal load, `depends('app:notes')`) and `+page.svelte`: back link, `#tag` heading, count, Timeline, empty state, error toast. `decodeURIComponent` is applied to the param because SvelteKit hands over the raw segment for percent-encoded paths.
- Timeline chips became `<a href="/tags/{encodeURIComponent(tag)}">` with a title; no new props needed, so every Timeline instance (main page and tag pages) gets them.
- Verified live with throwaway notes: `?tag=garden` returned exactly the two garden notes newest-first, `?tag=other` one, an unknown tag zero; `/tags/garden` 200 with `#garden`, "2 notes with this tag" and both notes in the SSR HTML; chip link `href="/tags/garden"` present in SSR. Probes deleted. `pnpm run check` 0/0, `pnpm run build` clean, `GET /` and `/tags/garden` 200.
- Known limits: no pagination, so a tag with thousands of notes renders them all; and a note whose edit removes the tag disappears from the page after the refresh, which is correct.
