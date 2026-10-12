Status: [DONE]

# Web app regression baseline

## Context
- The Tauri port changes shared files under `src/`. The web app must keep working exactly as it does now, in case we keep it.
- "Exactly as now" can only be proven against a recorded baseline. Once the shared files change, the current behaviour is gone and no test can demonstrate that nothing changed.
- So this task is a prerequisite for every other task in the series: it captures the behaviour before the first edit.
- A golden file built from `data/fermentario.db` would be useless twice over: it would carry personal journal text into every diff, and every new note would change the golden and mask a real regression. The tests use a frozen synthetic fixture instead.
- The tests must not download models. `GET /api/notes` fires `ensureIndexed()` and `ensureTags()` in the background, and both call transformers.js, which pulls weights from the Hugging Face CDN when the cache is empty. Without a guard, every run downloads 22 MB.

## Requirements
1. A frozen fixture at `tests/fixtures/journal.db`, built by `scripts/make-fixture.mjs` with better-sqlite3 (that build has FTS5; the system `sqlite3` CLI on this machine does not). Synthetic text, fixed UUIDs, fixed timestamps, deterministic 384-dim vectors. No personal data.
2. The fixture must contain the pagination edge case: two notes sharing a `created_at`, so the `(created_at, id)` cursor is exercised.
3. `scripts/offline-guard.mjs`, loaded into the test server with `--import`, rejects requests to the Hugging Face hosts only. Everything else keeps the real `fetch`.
4. `scripts/web-smoke.mjs` boots the production build (`node build`) on a temporary port against a copy of the fixture and records every page and every API route: the three pages plus a missing tag, `GET /api/status`, cursor pagination, the tag filter, the heatmap, the ask list, the empty-week summary, the chat rejection, create, edit, tag removal, every 404 path, delete, export and the import round trip.
5. The golden at `tests/baseline/web.json` is compared by default and rewritten only with `--update`. A changed set of check names is a failure, not a silent update.
6. The real `data/fermentario.db` is never opened by a test. `TZ=UTC` fixes the heatmap day keys, which use `localtime`.
7. Only the keys of `progress` objects are recorded. The values race with the background model passes; the contract does not.
8. The export step verifies the downloaded file with `quick_check` and row counts. Byte comparison is impossible because each run creates fresh UUIDs.

## Acceptance criteria
- `node scripts/web-smoke.mjs` reports every check matching the baseline, twice in a row, with no network access.
- `node scripts/web-smoke.mjs` fails when a route's response changes.
- The fixture contains no journal text from the real database.
- `pnpm run check` prints 0 errors and 0 warnings.

## Progress

### 2026-09-28 — done
- `scripts/make-fixture.mjs` writes a 77 KB fixture: 5 notes, 5 tag rows, 1 recap, 1 ask row, 5 vectors. Two notes share a `created_at` on purpose, so the `(created_at, id)` cursor is exercised. Built with better-sqlite3 because the system `sqlite3` CLI here has no FTS5.
- `scripts/offline-guard.mjs` blocks only the Hugging Face hosts, so the background `ensureIndexed()` and `ensureTags()` passes fail fast instead of downloading 22 MB of weights on every run.
- `scripts/web-smoke.mjs` boots `node build` on a temporary port against a copy of the fixture, with `TZ=UTC` and an empty model cache. 27 checks: four pages, both paginated pages of the note list, the tag filter and its miss, the heatmap, the ask list, the empty-week summary, the chat rejection, create, edit, tag removal, every 404 path, delete, export and the import round trip. `node scripts/web-smoke.mjs --update` rewrites `tests/baseline/web.json`.
- The export step is verified properly: the downloaded file is opened and checked with `quick_check` plus row counts, because byte comparison is impossible when each run creates fresh UUIDs.
- **Found and fixed a pre-existing bug.** `vite build` printed "No adapter specified" and wrote nothing to `build/`: the repo has never had a deployable production build. `vite.config.ts` passes options inline to `sveltekit()`, which makes the plugin ignore `svelte.config.js`, including `kit.adapter`. Fixed by passing the adapter inline — flat, not nested under `kit`, because `split_config()` only keeps the keys in `kit_options`, which are the contents of `kit`. `build/index.js` now exists.
- **The gate was verified to fail.** Reversing the heatmap day order produced exactly one diff, `GET /api/stats/heatmap`, and reverting it returned the suite to 27/27. A test that cannot fail is not a gate.
- Three bugs of my own in the first run, all fixed: the request helper hardcoded POST so PATCH returned 405; the import POST needed an `origin` header to satisfy SvelteKit's CSRF check; and masking ran at record time, so values revealed by a later step (`updated_at`, the temp `modelCache` path) leaked into the golden and broke stability.
- Verified: `pnpm run check` 0 errors and 0 warnings, `pnpm run build` produces `build/index.js`, `node scripts/web-smoke.mjs` 27/27 across three consecutive runs, and the live dev server still answers `/`, `/heatmap` and `/api/notes` with 200. `data/fermentario.db` was never opened by a test: 5 notes, main file mtime unchanged.
- Added `pnpm test`, `pnpm test:web`, `pnpm test:web:update` and `pnpm fixture` scripts.
- Recorded in `docs/lessons-learned.md`, including the two facts that decide task 020: the system `sqlite3` has no FTS5, and `notes_fts` has no triggers.

