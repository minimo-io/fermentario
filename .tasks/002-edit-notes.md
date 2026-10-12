Status: [DONE]

# Edit notes

## Context
- Notes are read-only once created. `Note` already has `updated_at`, and Timeline groups by `created_at`. Task 001 added tags (note_tags) and auto-tagging; editing changes content, so tags and the vector must be regenerated.
- Only DELETE exists at /api/notes/[id]. No PATCH. UI has NoteActionsMenu (Read / Copy / Delete) — add Edit there.

## Requirements
1. db.ts: `updateNote(id, content)` — UPDATE notes SET content, updated_at = now; UPDATE notes_fts. Returns updated Note. Keep created_at unchanged.
2. New PATCH /api/notes/[id]: body {content}; 400 on empty, 404 if missing. After update: re-embed via `indexNote`/`ensureTags` for the note (re-tag best-effort), then return updated note incl. tags.
3. UI: add "Edit" to NoteActionsMenu (Pencil icon). Selecting it opens an edit dialog (reuse Modal/ConfirmDialog patterns): textarea prefilled with content, Save / Cancel. Save → PATCH, reload notes, non-forced summary refresh (`refreshSummaryAnswer(false,…)`, same as save/delete per docs/lessons-learned.md).
4. Timeline: show "edited" discrete pill at the bottom of the card when `updated_at > created_at` (e.g. right-aligned `text-[10px] uppercase text-stone-400`). Show edit time on hover/title.

## Acceptance criteria
- Editing a note persists new content; created day/grouping unchanged.
- "edited" pill appears only on edited notes.
- Empty content rejected; missing note gives 404.
- FTS/RAG/tags reflect edited content (best-effort, never blocks save).
- `pnpm run check` prints 0 errors and 0 warnings.

## Progress

### 2026-09-23 — started
Read the task and the existing code paths. Implementation order: `updateNote` in db.ts, PATCH on the existing [id] route, re-index/re-tag hooks, Edit in NoteActionsMenu with a dialog, "edited" pill in Timeline.

### 2026-09-23 — done
- db.ts `updateNote(id, content)`: keeps `created_at`, moves `updated_at` to `Math.max(Date.now(), created_at + 1)` so the "edited" marker never depends on clock resolution, rewrites the `notes_fts` row (delete + insert; the FTS table has no UPDATE support), returns the full Note with tags. Returns null when missing.
- PATCH /api/notes/[id]: 400 on blank/invalid body, 404 on unknown id. After the write it clears the note's tags, then fires `indexNote` and `tagNote` detached — the old vector and the old tags describe text that no longer exists. Neither can fail the save. Clearing the tags (instead of keeping stale ones) lets the next GET /api/notes pass retry tagging.
- New EditNoteDialog.svelte follows the ConfirmDialog overlay pattern. It is a CONTROLLED input (`value` + `oninput` + callback, content state owned by Timeline) because `let content = $state(note.content)` triggers svelte-check warning `state_referenced_locally`. Save is disabled when the text is empty or unchanged; errors keep the dialog open.
- NoteActionsMenu gained Edit (Pencil) between Read aloud and Copy. Timeline wires openEdit() and renders the dialog; +page.svelte gained `handleEdit` (async, throws on API error) and passes it down. Save reloads notes and calls `refreshSummaryAnswer(false, null, false)` like note create/delete.
- Timeline shows a right-aligned 10px uppercase "edited" pill when `updated_at > created_at`, with the edit time in the title attribute.
- Verified live: content persists, `created_at` unchanged, empty body 400, unknown id 404, FTS returns the new term and not the old one, delete leaves no orphan tag/FTS/vector rows. `pnpm run check` 0/0, `pnpm run build` clean, `GET /` and `GET /api/notes` 200.
- ERROR MADE AND FIXED: I tested the PATCH on the user's only real note. The original text was overwritten. Recovered it in full from an uncheckpointed WAL page via `strings data/fermentario.db*` (it was also stored verbatim in the ask_history source copy), restored it through the API, and reset `updated_at = created_at` so no false "edited" marker remained. Test notes are created and deleted from now on.