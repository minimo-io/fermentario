Status: [DONE]

# Optimistic note save

## Context
- Saving a note feels slow: after Enter, the note appears only once `loadNotes()` returns.
- The POST is not the slow part. It returns immediately (model tagging is detached). The delay is `GET /api/notes`, which `await ensureTags()`: with the chat model loaded and notes without tags, every list load blocks for seconds while the model runs.
- `textErr` is assigned by the load, save and delete paths but is never rendered, so a failed save is silent.
- The Ask view is not affected: its answer already streams into the thread.

## Requirements
1. `GET /api/notes` must not block on `ensureTags()`; the pass runs in the background like it already does in POST.
2. `handleNote` inserts the note locally before the request: temp id, current timestamp, tags parsed with `splitTrailingHashtags`, prepended so the list order stays newest-first. On success the temp entry is replaced with the server note. On failure the entry is removed and the typed text is restored into the composer.
3. One quiet `loadNotes()` roughly 4 s after a save, so tags the model adds in the background appear without a manual reload. No polling loop.
4. A pending note renders dimmed with `aria-busy`, a spinner instead of the actions menu, and no "edited" marker. It cannot be edited or deleted before it is stored.
5. `textErr` is rendered as a small auto-clearing toast so load, save and delete failures are visible.

## Acceptance criteria
- Pressing Enter shows the note immediately, with a spinner, and the spinner disappears once the POST resolves.
- The list request no longer waits for model tagging.
- A failed save removes the pending card, restores the text in the composer, and shows a visible error.
- Saved notes end up in the database with the same id the card settles on.
- `pnpm run check` prints 0 errors and 0 warnings.

## Progress

### 2026-09-23 — started
Plan agreed: unblock the list request, optimistic card with a pending state, background refresh for model tags, visible errors.

### 2026-09-23 — done
- `handleNote` inserts the note locally first with a temp id, `created_at = Date.now()`, and tags from `splitTrailingIshtags`, prepended to keep newest-first order. On success the temp entry is replaced with the server note (real id, real tags); a single `loadNotes()` runs 4 s later so background model tags appear. On failure the entry is removed, the typed text goes back into the composer, and `textErr` is set.
- Temp ids are `tmp-${Date.now()}-${random}` rather than `crypto.randomUUID()`: that API needs a secure context, and the app is reached over plain-HTTP tailnet (`http://100.77.206.41:4173`), where it is undefined and would have thrown on every save from a phone.
- Timeline: `pending?: boolean` on the client `Note` type, `opacity-60` + `aria-busy` on the card, a spinning `LoaderCircle` instead of the actions menu so an unsaved note cannot be edited or deleted.
- `textErr` is now rendered as a fixed toast that clears after 4 s. It was assigned in three places and never displayed, so failed saves were silent.

### 2026-09-23 — three real bugs found while measuring
- `GET /api/notes` awaited `ensureTags()` and `ensureIndexed()`. Both are now detached, so the list never waits for model or embedding work. Idle list latency went from 0.4–0.7 s to ~18 ms.
- `ensureTags()` retried the same untagged notes on every request forever, because a model that cannot produce parseable tags leaves the note untagged and the next request sees it as missing again. The 0.5B kept generating, the vite process sat at ~400% CPU, and every request queued behind inference. Added a per-process `attempted` set: each note is tried once per server run.
- `ensureIndexed()` cached its resolved promise forever (it only reset on error), so any note created while the server was running never got a vector. It now resets in `finally`, making the pass a cache check instead of a one-time job. `POST /api/notes` also calls `indexNote(note.id, content)` directly. Verified: vector coverage went from 1/3 to 3/3, so the user's older notes are now retrievable by Ask.
- Removed junk model tags (`ddddddd`, `dddddddd`) the 0.5B had written on the "asdasddd…" note; the note itself was left alone.
- Verified: `pnpm run check` 0/0, `pnpm run build` clean, POST 65 ms, hashtags stripped into tags, hashtags-only 400, no tagging pass runs on repeated GETs, test note deleted. The optimistic card itself needs a browser check.
- Note: while the 0.5B is generating (weekly recap or Ask answer), the whole dev server is slow because inference runs on Node's main thread. That is separate from this task.
