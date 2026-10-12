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
