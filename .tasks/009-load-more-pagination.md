Status: [DONE]

# Load more pagination

## Context
- `listNotes(500)` silently hid everything older than 500 notes, and tag pages had no limit at all. At a thousand notes the timeline is unusable and unreachable.
- `ensureIndexed()` loaded every note with its tags plus every vector blob on each list request, only to find the few missing one.
- Timeline grouped by day with `grouped.filter((g) => g.day === day)` inside the day loop, which is O(days × notes) per render.

## Requirements
1. One listing path: `listNotesPage({ limit, before, beforeId, tag })` returns `{ notes, hasMore, nextCursor }`, ordered `created_at DESC, id DESC`, with the id tiebreak so same-millisecond notes are never skipped or repeated. `listNotes(500)` and `listNotesByTag()` are removed.
2. `GET /api/notes` accepts `limit` (default 50, cap 100), `before`, `before_id` and `tag`, and returns `count` for the filter. A tag request is filtered on the server, so an appended page only ever contains that tag.
3. `ensureIndexed()` uses an anti-join with `LIMIT 25` instead of loading the whole table and all vectors per request.
4. One `NotePager` holds the list, cursor, `hasMore` and `count` for both pages, with `seed`, `open`, `loadMore`, `prepend`, `remove`, `patch` and `sync`. A tag pager keeps only notes carrying the tag when appending.
5. A full-width "Load more" button under the last day in Timeline, disabled with a spinner while loading, rendered only when there is more. Day grouping is built in one pass.
6. Optimistic prepend, quiet background sync, edit and delete keep working without collapsing an accumulated list.

## Acceptance criteria
- Page 1 returns 50 notes with `hasMore: true`; the next cursor returns the following notes with no overlap and no gap; the last page reports `hasMore: false`.
- On a tag page every appended page contains only that tag.
- Clicking Load more appends without duplicates and without losing the optimistic card or the scroll position.
- `pnpm run check` prints 0 errors and 0 warnings.

## Progress

### 2026-09-23 — started
User asked for a simple Load more button, not infinite scroll, and for the tag page to append only notes with that tag.

### 2026-09-23 — done
- Renumbered to 009: the user added `008 Configurable summary prompt` while this task was in progress, so the pagination task file moved to 009 to keep the numbering unique.
- `listNotesPage({ limit, before, beforeId, tag })` in db.ts: ordered `created_at DESC, id DESC`, cursor condition `(created_at < ? OR (created_at = ? AND id < ?))`, fetches `limit + 1` to set `hasMore`, returns `{ notes, hasMore, nextCursor }`. `listNotes(500)` and `listNotesByTag()` are deleted, so the 500 cap cannot come back. Added `countNotesByTag` and `notesMissingVectors`.
- `ensureIndexed()` now loops over `notesMissingVectors(25)` (anti-join) instead of `listNotes(100000).filter(...)` + `allVectors()`; a list request no longer reads the whole table.
- `GET /api/notes?limit&before&before_id&tag`; default 50, cap 100, `count` is the true total for the filter. Tag requests skip the background passes and are filtered per page on the server.
- New src/lib/note-pager.svelte.ts: `NotePager` with `$state` class fields (`seed`, `open`, `loadMore`, `prepend`, `remove`, `patch`, `hasTag`, `sync`). A tag pager additionally filters the appended page by tag. `sync()` patches only known notes so background tags never collapse the list.
- Main page: `notes` is now `pager.notes`; delete uses `remove`, edit uses `patch`, the 4 s quiet refresh uses `sync` — none of them refetch the list, so scroll position and accumulated pages survive.
- Tag page: the SSR load returns the first page plus cursor, seeds the pager in an `$effect` (so client navigation to another tag re-seeds), and an edit drops the note when the edit removed the tag.
- Timeline: `onLoadMore` / `hasMore` / `loadingMore` props with a full-width "Load more" button (spinner + disabled while loading, hidden when there is no next page). Day grouping is now one `Map` pass instead of `filter` per day.
- Verified live: 60 seeded `#pagetest` notes gave pages of 50 and 10, all 60 unique, every appended note carrying the tag; unknown tag returned 0. With 1063 notes the cursor walk took 22 pages, yielded 1063 unique ids and zero duplicates. All 1060 seeded rows deleted afterwards, no orphan tag/FTS/vector rows, the user's 3 notes untouched. `pnpm run check` 0/0, `pnpm run build` clean, `GET /` and `/tags/garden` 200.
- Not done on purpose: no IntersectionObserver, no `withTags` placeholder chunking (1000 is far below SQLite's 32766 limit), the Ask history thread is still unlimited.

### Follow-up — fold persistence clobber (fix)
- Bug: folds vanished on reload when folding across the two timelines the
  home page mounts at once (featured section + history). Each instance had
  its OWN `collapsed` map but they wrote the SAME storage key, so the
  latest write replaced the whole array (featured fold kept, earlier
  ordinary folds lost — exactly what was reported).
- Fix: the fold map is module state in `Timeline.svelte` (`<script
  module>`), one shared record for every instance; storage is loaded once
  per page view (no per-instance re-parse) and pruned only by an explicit
  expand. Verified: fold featured in the featured section + three ordinary
  notes in the history section → storage holds all 4, reload keeps every
  fold (featured folded in BOTH lists, same shared map), expand prunes to
  3. Gates green (check 0/0, build + `build/index.js`, test 31/31,
  `GET /` 200).

### Follow-up — foldable notes + inline markdown (revised: measured tap-to-fold)
- Any note longer than ONE RENDERED line folds on tap of the note text;
  long paragraphs without newlines are foldable too. Foldability is
  measured from the unfolded rendered height (height ÷ line-height > 1.5),
  re-measured on `resize`; a persisted fold is trusted as-is — Chromium
  does not overflow-report `scrollHeight` on a `-webkit-line-clamp` box, so
  re-measuring folded content wrongly unfolded it. Folded = native
  `line-clamp-1` (ellipsis for free; no first-line string split, no
  `+N more` hint). Short notes stay plain non-tappable text.
- Fold state persists in `localStorage` key `ferm:collapsed-notes`
  (array), read client-side with try/catch, pruned to current ids, cleared
  on expand. Default expanded; SSR/first paint expanded.
- Gestures: the note text is the ONLY fold toggle; opening a note moved
  into the ⋮ menu ("Open note", first item; `NoteActionsMenu` gained an
  optional `onOpen`, the note's own page does not pass it). The hour stamp
  is no longer a link. On mobile the ⋮ (and pending spinner) float
  absolute top-right inside the card (`max-sm:top-1 max-sm:right-2`, white
  circle backdrop) and the text spans the full card width; desktop keeps
  the inline ⋮ after the text. The `edited` marker is `text-left` on
  mobile, `sm:text-right`.
- Follow-up — mobile stretch fix: the inner content row needed
  `max-sm:w-full`. Under `items-start` + `max-sm:flex-col` a flex child
  shrinks to its CONTENT width — short notes made the row ~half card
  wide: text did not span the card and the bottom-right pill row
  "right-aligned" against a mid-card edge, visually crowding the ⋮'s
  band. Earlier verification used long wrapping text (whose row happens
  to fill) and missed it. Now measured with short + long notes: row 340px
  and pill right edge = content right edge on both; desktop pill still
  inline left of the ⋮ (887 < 899).
- Markdown: `inlineMarkdown(src)` (`src/lib/markdown-inline.ts`) — escape
  `<>&` first, then `**x**` → `<strong>`, `*x*` → `<em>` (delimiters hug
  non-space chars, one line; `3*4` stays literal). Applied to the timeline
  (folded and full) and `/notes/[id]`; tasks and principles stay plain.
  Edit dialog, copy and export keep raw markers.
- Verified live on 390px and 1280px: wrapper-free long paragraphs fold and
  clamp (scrollHeight > clientHeight), fold survives reload with clamp
  intact, expand clears storage; short note plain; featured star + amber
  border survive folding; mobile ⋮ absolute (top Δ5/right Δ9) with full-width
  text; desktop ⋮ static inline; menu first item "Open note" navigates to
  the note page, note-page menu lacks it; edited marker left on mobile,
  right on desktop. Gates green (check 0/0, build + `build/index.js`,
  test 31/31, `GET /` 200).
