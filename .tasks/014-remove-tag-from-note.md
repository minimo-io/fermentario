Status: [DONE]

# Remove a tag from a note

## Context
- Tags live in `note_tags` and the only write path was `setNoteTags(noteId, tags)`, which replaces the whole set. There was no way to drop one tag without rewriting the note.
- The chip is a bare `<a href="/tags/...">` in Timeline.svelte, so a button cannot be nested inside it; a button inside an anchor is invalid HTML and breaks keyboard and screen-reader behaviour.
- `ConfirmDialog` is already imported in Timeline for note deletion, so the confirm gate reuses it.

## Requirements
1. Remove exactly one tag from one note, without touching the note text, its FTS row or its vector.
2. A × button inside the chip, revealed on hover and on keyboard focus.
3. A confirmation dialog before the removal.
4. Available from both the main timeline and the tag pages.
5. A failed removal leaves the chip untouched and reports the error.

## Acceptance criteria
- Removing one tag leaves the note, its text, its other tags and its search index untouched.
- A repeated removal and an unknown note both answer 404 and change nothing.
- An uppercase tag in the request matches the stored lowercase row.
- `pnpm run check` prints 0 errors and 0 warnings.

## Progress

### 2026-09-24 — done
- `removeNoteTag(noteId, tag)` in db.ts: one `DELETE ... WHERE note_id = ? AND tag = ?`, normalising the tag the way `setNoteTags` stores it, returning `changes > 0`.
- New sub-resource `DELETE /api/notes/[id]/tags/[tag]`, deliberately not a field on `PATCH /api/notes/[id]` so a tag change can never touch the text, FTS or the vector. 404 for an unknown note (`getNote` check) and for a missing tag link.
- Timeline: each chip becomes a `span.group` wrapper holding the existing link plus a `×` button (`aria-label="Remove #tag from this note"`), `opacity-0` until `group-hover` or `focus-visible`. Without an `onRemoveTag` prop the old plain chip renders, so the component stays safe elsewhere.
- `onRemoveTag?: (noteId, tag) => void` prop. Clicking the × sets local `tagTarget` state and opens the existing `ConfirmDialog` in danger tone, naming the tag and stating that the note stays and other notes are unaffected.
- Main page `removeTag()`: DELETE, then patch the note with the remaining tags, or `pager.remove(noteId)` when that was the last tag, so a tag page drops the note from its filtered list. Errors go through the existing toast. Tag page uses the same route and `pager.remove` because it is filtering on that tag.
- Verified live on a throwaway note with `#alpha #beta`: tags removed one at a time, a repeat 404, uppercase `#BETA` matched the lowercase row, an unknown note 404, and the stored content stayed `tag removal probe` (the `-wal` FTS check from the sqlite3 CLI is unavailable because the system CLI lacks the fts5 module, so it was not asserted there). Probe deleted; 3 user notes intact.
- `pnpm run check` 0/0, `build` clean, `GET /`, `/heatmap`, `/tags/garden`, `/api/notes` 200, and the built chunk contains the × aria-label.
- Incident handled: the dev server began returning 500 on every database request (`SqliteError: disk I/O error` at the `journal_mode` pragma in db.ts) after a module reload left its old WAL connection orphaned; a separate process opened the file fine with `integrity_check: ok` and an empty `-wal`. Restarting the dev server fixed it. No data was at risk.
- The hover × and the confirm dialog need a browser pass from the user.

### 2026-09-24 — follow-up: dev server restarts
The dev server had to be restarted twice during this session (once for a wedged SQLite connection, once after `vite.config.ts` changed, which makes Vite restart). Both times the database file was verified healthy first (`integrity_check: ok`) and no data was at risk.
