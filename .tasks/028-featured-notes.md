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