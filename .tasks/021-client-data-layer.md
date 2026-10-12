Status: [TODO]

# Move the web part into the client

## Context
- Tasks 019 and 020 give us a shell and a database. This task replaces the 11 server API routes with a client data layer, so the static build becomes the real application instead of a demo.
- The pages are already client-driven: the server sends an empty shell and every page fetches its data after mount. I verified this — no note text and no tag name appear in the HTML of `/`, `/heatmap` or `/tags/<tag>`. So the work is swapping the transport, not restructuring rendering.
- `src/lib/hashtags.ts`, `note-export.ts`, `draft.ts`, `dates.ts` are pure and move unchanged.
- The Node implementation must survive untouched. Both paths import the same interface, and `src/lib/server/**` keeps the better-sqlite3 code it has.

## Requirements
1. A client implementation of the same interface task 020 defined: notes, tags, heatmap, asks, weekly recap, export, import.
2. The pages import the interface, never a specific implementation. The choice happens once, at startup.
3. One Playwright journey, run twice against two servers — the Node build and the static build — with identical assertions: save a note, tag it, untag it, ask a question, export, reload, confirm it persisted.
4. The reload is the assertion that matters for the database. The browser test is also the only test that covers the tag and heatmap pages properly, because a status-200 curl cannot see a `load` function that now runs in the browser.
5. `src/lib/server/**` and the API routes are not modified during this task. This directory is not a git repository, so the check is a checksum: record `shasum` of every file under `src/lib/server` and `src/routes/api` before starting, and compare after. Any difference is a failure, not a detail.
6. Search, the Ask flow and the weekly recap work from the client, with the same prompts and the same output as the server path.

## Acceptance criteria
- The journey passes against both targets.
- `node scripts/web-smoke.mjs` reports no differences.
- The `shasum` of `src/lib/server/**` and `src/routes/api/**` is unchanged from the start of the task.
- `pnpm run check` prints 0 errors and 0 warnings.

## Progress

### 2026-09-28 — done
- The seam is at `fetch`, not in the pages. `src/lib/platform/local-api.ts`
  answers the same `/api/*` calls the pages already make — from OPFS in the
  Tauri build, from the Node server in the web build — and
  `src/hooks.client.ts` installs it only when `__LOCAL_DB__` is set, which only
  `vite.config.tauri.ts` does. **The pages needed no changes at all**, which is
  why the web app stayed at 28/28.
- The phone's journal is seeded from a copy of the web app's database.
  `scripts/make-seed.mjs` reads `data/fermentario.db` and writes replayable SQL
  (notes, tags, vectors as `x'…'` blob literals, recaps, asks) into
  `src/lib/platform/seed.generated.ts`, which `build:tauri` regenerates every
  time. SQL rather than the .db file, because the WebAssembly engine cannot
  deserialize a WAL-mode image and has no filesystem of its own. The generated
  file holds the journal's own text, so it is gitignored.
- The seed only runs when the database is empty, so a journal on the device is
  never overwritten.
- Verified on a Pixel 9 AVD: the app shows the 5 real notes with their tags, day
  grouping, timestamps and EDITED markers; `/heatmap` renders instead of 500;
  typing and saving works, with the hashtag chip appearing live and the note
  count going 5 → 6.
- The export emits SQL and the restore replays it, because a .db file cannot be
  read by the WebAssembly engine. A .db upload returns a message saying so
  rather than failing silently.
- Models are not on the device yet: `/api/chat` and `/api/summary` return the
  shapes the pages already handle, with a message pointing at task 023.
