Status: [DONE]

# AI auto-tags for new notes

## Context
- Fermentario is a SvelteKit journal. Notes live in SQLite (`notes` table, `createNote` in src/lib/server/db.ts). No tags exist anywhere.
- Local chat models (Qwen 0.5B/1.5B) run via `chat()` in src/lib/server/models.ts. `getChatModelReady()` reports whether the active model is loaded. The 0.5B model fabricates and is chatty; keep prompts minimal and clean its output (see `clean()` in src/routes/api/summary/+server.ts and docs/lessons-learned.md).
- Tags must not block note creation. Model load blocks the main thread; do the work after the response.

## Requirements
1. Add table `note_tags` (note_id TEXT REFERENCES notes(id) ON DELETE CASCADE, tag TEXT, PRIMARY KEY (note_id, tag)) and a `Note` type field `tags: string[]`. `listNotes`/`getNote` include tags.
2. After a note is created (POST /api/notes), generate 3-5 short lowercase tags from the note content using `chat()`. Store them.
3. Generation is best-effort and fire-and-forget: if the chat model is not ready or fails, the note stays untagged and the request never fails. An `ensureTags()` pass (pattern of `ensureIndexed()` in src/lib/server/rag.ts) tags notes missing tags whenever the model is ready, called from GET /api/notes.
4. Prompt, minimal, in the style of the summary prompt: system "You assign short tags to private journal notes." User lists the note and asks for 3-5 short tags, single words or short phrases, lowercase, comma-separated, derived only from the note content. `maxNewTokens` ~60, greedy decode.
5. Clean the model output: strip preamble, split on commas, lowercase and trim, cap at 5, drop empties; refuse to store if the output is a refusal or unparseable.
6. UI: render tags as small chips under the note content in Timeline.svelte.

## Acceptance criteria
- Creating a note with a loaded model persists 3-5 tags derived from the content.
- Tags survive restart and vanish when the note is deleted (cascade).
- Note creation with the model not loaded still succeeds; the note gets tagged on a later pass.
- Note cards display the tags.
- `pnpm run check` prints 0 errors and 0 warnings.

## Progress

### 2026-09-23 — implemented
- `note_tags` table (FK cascade, PRIMARY KEY (note_id, tag)) in src/lib/server/db.ts; `Note.tags` in both db.ts and src/lib/types.ts; `setNoteTags`, `notesMissingTags`, and batched `tagsByNote` lookup (single query for a note list, no N+1). `listNotes`/`getNote`/`notesBetween` all return tags.
- src/lib/server/tags.ts: `generateTagsForNote` (minimal prompt, maxNewTokens 60, greedy), `tagNote`, and `ensureTags()` (mirrors `ensureIndexed`, single-flight, only runs when `getChatModelReady()`, never forces a load).
- POST /api/notes fires `tagNote` without awaiting (request never fails); GET /api/notes awaits `ensureTags()` so untagged notes get tagged on a later pass.
- Timeline.svelte renders `#tag` chips under the note content.

### 2026-09-23 — model finding (user decision: ship best-effort)
- The 0.5B model cannot tag. Probed live through a temporary route: it echoed the prompt, wrote meta-plans ("To complete this task, I will follow these steps"), and hallucinated unrelated content (a "Red Herring" logical-fallacy answer, a Python class). `cleanTags` rejected all of it.
- Hardened `cleanTags` after a probe stored one junk tag (`tagged "cooked" before "pasta`): now rejects items that still contain quotes, items over 40 chars, items over 4 words, and requires at least 2 tags before returning anything. Prose no longer reaches the database.
- User chose "ship best-effort as designed". Acceptance criterion "persists 3-5 tags" therefore only holds on a capable model (1.5B+). With 0.5B, notes stay untagged — by design, and never with garbage.
- Verified: storage, `cleanTags` refusal path, GET pass, note creation with the model busy, and cascade on delete (deleted test notes through the API; no orphaned note_tags rows). `pnpm run check` 0/0, `pnpm run build` clean, `GET /` and `GET /api/notes` 200.
- Temporary `/api/_probe` route and debug logging removed.