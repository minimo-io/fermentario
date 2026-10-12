Status: [DONE]

# Model label, database download, stop an answer

## Context
- The Models modal select was labelled "Summary model" although it is the only chat model in the app: `api/chat` (Ask) never selects a model, it uses the single `activeChatModelId` slot in `src/lib/server/models.ts`, which `api/summary` sets from `?model=`. The MiniLM row is a different model (embedding) that only produces vectors for retrieval.
- The database runs in WAL mode (`db.ts`), so a copy of `fermentario.db` can be missing recent writes that still sit in `-wal`.
- An in-flight Ask had no way to stop: the composer button was disabled while `answering`, and the SSE stream ran to completion.

## Requirements
1. Label the select "Summary & Ask model" (id `chat-model`) and change the 1.5B detail to "better answers & recaps".
2. Config modal gets a "Download database" link to a new `GET /api/export`, which checkpoints the WAL and streams the file as an attachment named `fermentario-<date>.db`.
3. While an answer is streaming, the composer's Ask button becomes a Stop button. Stopping aborts the request, keeps the partial text with a "stopped — not saved to history" marker, and shows no error.
4. A cancelled answer is never inserted into ask history. `chat()` accepts an `AbortSignal` and unwinds generation on the next token; `api/chat` checks `request.signal.aborted` after generation and resets the chat model.

## Acceptance criteria
- The modal shows the corrected label.
- The downloaded file opens as a valid SQLite database containing the notes, tags, recaps and ask history.
- Clicking Stop ends the stream, keeps the partial answer on screen, and leaves no ask_history row.
- A following ask still works after a cancel.
- `pnpm run check` prints 0 errors and 0 warnings.

## Progress

### 2026-09-24 — done
- ModelsModal: label `Summary &amp; Ask model`, `for`/`id` changed to `chat-model`. chat-models.ts: 1.5B detail is now "better answers & recaps". Both strings confirmed in the built client bundle (Svelte keeps the entity in the template string, as with the existing "Models & status" heading).
- New `src/routes/api/export/+server.ts`: `db.pragma('wal_checkpoint(TRUNCATE)')` in a try/catch, then `createReadStream` piped through `Readable.toWeb`, with `application/vnd.sqlite3` and `attachment; filename="fermentario-<date>.db"`. ConfigModal renders a "Download database" anchor plus a line describing the contents.
- Verified the download: `content-disposition` and content type correct, `PRAGMA integrity_check` on the saved copy returns `ok`, and it contains 4 notes, 1 tag row, 5 ask rows, 2 recaps. Temp copy deleted.
- `ChatPayload.signal` added; the `TextStreamer` callback throws `AbortError` when the signal is set, and the refusal retry is skipped when aborted. `api/chat` passes `request.signal`, resets the chat model and returns without `insertAsk` when aborted; the catch/finally no longer enqueue on a dead controller.
- Client: `askAbort` + `answerStopped` state, `stopAsk()`, signal passed to the fetch, partial answer kept and marked. Composer: `onStop` prop and a Stop button (square icon) replacing Ask while `answering`; AskTab renders the "stopped — not saved to history" note.
- Verified: a 2.5 s client abort on a running ask stored nothing (ask count unchanged, no probe row), `/api/status` reported the chat model ready afterwards, and the next ask streamed normally. No probe rows left in ask_history.
- `pnpm run check` 0/0, `pnpm run build` clean, `GET /`, `/api/export`, `/api/asks` all 200.
- Note: the app has no authentication and is reachable on the tailnet, so `/api/export` hands the full journal to anyone who can reach the port. Acceptable for a personal local app; keep the port private if that changes.
