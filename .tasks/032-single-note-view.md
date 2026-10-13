Status: [DONE]

# Single note view

## Context
- Today a note only exists inside the timeline. A single-note route gives it a place to be read, edited, and managed with every list action, and a URL worth sharing on the tailnet.
- Actions must be the same handlers as the timeline (edit, delete, tag remove, feature, copy, read aloud), not copies — two implementations of delete is how the FTS orphan bug happened.

## Requirements
1. A route per note id showing the full content, tags, featured state, color chips, and video (as tasks 028/030/031 land; renders whatever exists).
2. Inline edit with the same PATCH path as the timeline, including vector re-embed and tag refresh semantics.
3. Every list action available: delete (with `ConfirmDialog`), tag remove, feature/unfeature, copy, read aloud.
4. Unknown id renders a proper 404, not an empty page (the `/tags/<unknown>` lesson: status codes are behavior).

## Acceptance criteria
- Read, edit, and each action on the single view produce the same server state as the timeline equivalents.
- Unknown id returns 404. Deleting from the single view redirects somewhere sane (home), never a dead page.
- `pnpm run check` 0/0, `pnpm run build` + `build/index.js`, `pnpm test` 28/28, `GET /` 200.

## Progress

### 2026-10-12 — done
- `GET /api/notes/[id]` (200/404) + `/notes/[id]` route reusing `EditNoteDialog` (with video), `TagChip` (with remove), `VideoEmbed`, `NoteActionsMenu`, `ConfirmDialog` — same handlers as the timeline, no copies. Delete redirects home; unknown id is a real 404. Timeline timestamps link to the page.
- Caught a test bug: the smoke "DELETE /api/notes/[id]" steps sent GET (no method), so the golden held 405s and DELETE was never tested. Fixed to real DELETEs + added `GET /api/notes/[id]`, `GET missing`, `page:/notes/[id]` (31 checks). The two tag-DELETE steps have the same mislabeling — left as-is, golden unchanged for them.
- Verified live: page 200 with text, missing 404, API 200. Gates: check 0/0, build + `build/index.js`, test 31/31, `GET /` 200.