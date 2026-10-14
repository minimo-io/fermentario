Status: [DONE]

# Featured notes

## Context
- Important notes sink in the timeline. A featured flag pins them above everything else, in the Notes view and on tag pages.
- Featuring is one more entry in the existing per-note action menu (`NoteActionsMenu.svelte`), next to Read aloud, Copy, and Delete — not a new control surface.

## Requirements
1. A Feature/Unfeature action in the per-note action menu.
2. Featured notes pin above the timeline in the Notes view and on tag pages, newest featured first, then the normal cursor-paginated list below.
3. Optimistic prepend, Load more pagination, edit, and delete keep working with featured notes present (the pager must not repeat or swallow them).
4. A flag on the note row (new column). Edit, tags, vectors, and export are unaffected by the flag.

## Acceptance criteria
- Featuring pins the note to the top in the Notes view and its tag pages; unfeaturing restores chronological order.
- Paging to the second page with featured notes present shows no duplicates and no gaps.
- `pnpm run check` 0/0, `pnpm run build` + `build/index.js`, `pnpm test` 28/28, `GET /` 200.

## Progress

### 2026-10-12 — done
- `notes.featured` column (schema + PRAGMA migration for old DBs), `setNoteFeatured` (flag-only, no FTS/vector/tag touch), `listNotesPage` `featured: only|exclude` (default `all`, golden-safe), `Note.featured` end to end.
- `PATCH /api/notes/[id]` takes `{featured}` without content; `GET /api/notes` takes `?featured=`. Note pager carries the filter so Load more never reintroduces pinned notes.
- UI: Feature/Unfeature in `NoteActionsMenu`, pin marker on cards, pinned `Timeline` above the list in Notes view and tag pages; edit/delete/feature keep both lists consistent without refetch (scroll safe).
- Intended golden change recorded via `test:web:update`: only `+featured:false` lines (9 insertions). Fixture `-shm`/`-wal` sidecars restored after the rebuild.
- Verified live on throwaway DBs: feature/unfeature, only/exclude, 404 on missing, old-DB migration. Gates: check 0/0, build + `build/index.js`, test 28/28, `GET /` 200.

### Follow-up — in-progress notes
- `notes.in_progress` column (schema + migration), `setNoteInProgress` flag-only, `listNotesPage`/`GET` gain `inprogress=only|exclude`, pager excludes both flags. Pinned order: In progress, then Featured, then the list; one shared `flagNote`/`flag` mover on main + tag pages, single-note view included. Cards and the single view show a soft gold "In progress" tag; menu entry with `CircleDot` icon. Golden recorded (`+inProgress:false` only). Verified live incl. main-list exclusion. Gates re-run green.

### Follow-up — in-progress removed from notes (user call)
- The flag was a task concept all along. Removed end to end: schema, helpers, routes, pager, menu, pinned groups, single view. `ALTER TABLE notes DROP COLUMN in_progress` migration (SQLite 3.53 confirmed); golden re-recorded (only `-inProgress` lines). Verified live on a DB carrying the dropped column. To-Do items untouched.
- Toggle label fixed: "Mark as not in progress" (Done stays the completion action).

### Follow-up — golden border + null guard
- Featured cards (timeline + single view) use `border-amber-400` instead of grey. Verified live: flagged note's page SSR carries the amber class.
- `toggleItem`/`progressItem` now verify `d.item` exists before touching `saved.id`, so a missing item shows the server's message instead of `Cannot read properties of null`. Could not reproduce on clean state (server returns 200 + item); if the toast persists, restart the dev server to rule out mixed modules and capture the PATCH status/body.

### Follow-up — date on its own line on mobile
- Card is `max-sm:flex-col`: hour first, then the content+menu row. Desktop row unchanged; verified class in the compiled bundle (SSR shell is empty by design). Gates re-run green.