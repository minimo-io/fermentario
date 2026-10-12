Status: [DONE]

# Restore UX: confirm, progress, visible refresh

## Context
- Task 011 shipped a working restore with poor UX: the Restore button posted immediately (no confirmation, so one click replaced the journal), the only feedback was a button label, and the post-restore refetch happened behind a closing modal so nothing appeared to happen.
- The import already had five natural phase points, and `/api/chat` already established the SSE pattern on both server and client.

## Requirements
1. A confirm gate before anything destructive, naming the file and stating that notes, tags, recaps and ask history are all replaced and that it cannot be undone.
2. Progress during the restore as real phases, not an invented percentage: uploading, validating, replacing, rebuilding search, finishing.
3. A visible, non-dismissable overlay with the stepper, an elapsed-seconds counter, and a distinct error state that says nothing was changed.
4. After success: refetch notes, ask history and the weekly recap, and confirm with a toast carrying the real counts.
5. One toast implementation for errors and successes instead of a rose-only block.

## Acceptance criteria
- Restoring asks for confirmation first and Cancel changes nothing.
- The overlay shows each phase as the server reports it and ends in an explicit done or failed state.
- A successful restore refreshes the visible data and reports the imported counts.
- A failed restore leaves the journal untouched and explains why.
- `pnpm run check` prints 0 errors and 0 warnings.

## Progress

### 2026-09-24 — done
- `POST /api/import` now answers with `text/event-stream`. The stream opens before the request body is read, so `uploading` is visible while the file is still arriving. Events: `{phase}`, `{done, counts}`, `{error}`. The FTS rebuild is its own statement so `search` can be emitted between the row replacement and the rebuild inside the same transaction; a failure there still rolls back.
- New `RestoreOverlay.svelte`: file name, five-step stepper (ticked / spinning / pending), elapsed seconds, "keep the app open", a success state and a failure state that states nothing changed plus a Close button. Rendered from `+page` so it survives the Config modal closing.
- ConfigModal: `Restore…` now opens the existing `ConfirmDialog` (danger tone, "Replace everything"), states the file name and exactly what is lost and that it cannot be undone, and clears the file input once the restore starts. It hands the `File` to the page through `onRestoreStart`; the page closes the modal and takes over.
- `+page.runRestore(file)` reads the SSE stream (same reader as `handleAsk`), updates the phase, then on `done` calls `pager.open()`, `loadAsks()` and a forced `refreshSummaryAnswer`, switches to Notes, and toasts "Journal restored — N notes, N tags, N recaps, N questions". The overlay auto-closes after 2.5 s; a failure keeps it open with the server message.
- The `textErr` block became one `toast` state with an `error` / `success` tone (4 s for errors, 8 s for success) reused by the load, save, delete and restore paths.
- BUG FOUND WHILE VERIFYING: rewriting the route dropped `DELETE FROM notes_fts`. FTS has no foreign key, so `DELETE FROM notes` did not clear it and every restore stacked another copy of the index (4 notes had 13 index rows, and a deleted note stayed searchable). Restored the delete, and the check that caught it — `count(notes_fts) === count(notes)` — is now part of the verification.
- Verified live: phases arrive in order (`uploading`, `validating`, `replacing`, `search`, `finishing`, `done` with counts); a text file produces an `error` event and leaves the journal untouched; after restoring, `notes_fts` row count equals the note count, a deleted probe is no longer searchable, real notes still match (`ritual`), `integrity_check` is ok and no `import-*` temp files remain. The user's journal is intact: 4 notes, 1 tag, 2 recaps, 4 ask entries.
- `pnpm run check` 0/0, `pnpm run build` clean, `GET /`, `/api/export`, `/api/asks`, `/api/notes` 200, and both new strings present in the built client.
- The browser pass (confirm dialog, stepper animation, toast) still needs the user.
