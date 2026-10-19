# Tools

## `pnpm test` — web app regression gate
`node scripts/web-smoke.mjs`

Boots the production build (`node build`) on a temporary port against a copy of
the frozen fixture, exercises every page and every API route, and compares the
result with `tests/baseline/web.json`. 47 checks. The export/import round trip
creates one row in every section, restores the exported file, and reads every
section back through the API.

| Command | What it does |
| --- | --- |
| `pnpm test` | Compare against the golden. Exits 1 on any difference. |
| `pnpm run test:web:update` | Rebuild the fixture and rewrite the golden. Read the diff. |
| `pnpm run fixture` | Rewrite `tests/fixtures/journal.db` only. |

Rules that keep it a real gate:
- It never opens `data/fermentario.db`. Every run copies the fixture into a temp directory.
- It downloads nothing. `scripts/offline-guard.mjs` rejects the Hugging Face hosts, so the background `ensureIndexed()` and `ensureTags()` passes fail fast instead of pulling 22 MB of weights.
- `TZ=UTC` fixes the heatmap day keys, which are computed with `localtime`.
- The model cache is an empty temp directory, so no 488 MB model loads.
- Runtime values — fresh UUIDs, fresh timestamps, the temp path — are masked once at serialization time.
- A changed set of check names is a failure. The golden is not silently rewritten.

## `pnpm start` — production server
`node scripts/start.mjs`

Sets `BODY_SIZE_LIMIT=110M` (unless the deployment already sets it) and then
loads `build/index.js`. adapter-node's 512 KB default rejects a real database
restore before the route can run. `ORIGIN` is still deployment-specific: set it
when the app runs over plain HTTP behind a proxy, or the import form fails the
CSRF origin check.

## `pnpm run fixture` — frozen test database
`node scripts/make-fixture.mjs [output-path]`

Writes `tests/fixtures/journal.db`: 5 notes, 5 tag rows, 1 recap, 1 ask row, 5 vectors, 77 KB. Everything is fixed — UUIDs, timestamps, and 384-dim float32 vectors from a deterministic function.

It is synthetic on purpose. A golden built from the real journal would carry personal text into every diff, and would change whenever a new note was written, which hides real regressions.

Two notes share a `created_at`, so the `(created_at, id)` pagination cursor is exercised: any change to the ordering shows up as a reordering in the golden.

Built with better-sqlite3, because that build has FTS5. The system `sqlite3` CLI on this machine does not.

## `scripts/offline-guard.mjs` — test-only network guard
Loaded into the smoke-test server with `--import`. Active only when
`FERMENTARIO_TEST_OFFLINE=1`.

Rejects requests to the Hugging Face hosts and passes everything else to the
real `fetch`, so SvelteKit's own server-side fetch is unaffected. Without it,
every test run downloads model weights, because `GET /api/notes` starts the
background indexing and tagging passes.

## Future: engine parity tests
Task 020. Will run the real DDL and every query against both better-sqlite3 and
`@sqlite.org/sqlite-wasm` using the same fixture, and compare rows, ordering,
BM25 results and the vector blobs byte for byte.
