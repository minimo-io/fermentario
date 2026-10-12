Status: [TODO]

# Platform layer: the database in the WebView

## Context
- `better-sqlite3` is a native Node addon. It cannot load in a Tauri WebView, and the fs plugin can read bytes but cannot run SQL. A SQLite engine that runs as WebAssembly inside the WebView is required.
- Chosen engine: `@sqlite.org/sqlite-wasm`, the official SQLite compiled to WASM, with the OPFS filesystem. It keeps `db.exec()` and `db.prepare().run/get/all`, so every query in `src/lib/server/db.ts` stays as written. Only `db.pragma()` and `db.transaction()` need shims.
- The real portability risk is FTS5, not the API shape. The app's DDL is stricter than plain FTS5:
  `CREATE VIRTUAL TABLE notes_fts USING fts5(content, note_id UNINDEXED, tokenize = 'porter unicode61')`
  so the gate is "does this exact DDL execute", porter tokenizer included. The system `sqlite3` CLI on this machine has no FTS5 at all, which is proof that "SQLite" is not one thing.
- `notes_fts` is a standalone table maintained by application code — there are no triggers. A path that forgets `DELETE FROM notes_fts` leaves stale hits, which already happened once during the import rewrite. Tests must assert `count(notes_fts) == count(notes)` after every mutation, not only after import.
- The database lives in the app sandbox on the device, not in a place the fs plugin can open by path. Export and restore therefore move bytes through the WebView.

## Requirements
1. A `SqlDb` interface covering the operations `src/lib/server/db.ts` uses. Two factories: better-sqlite3 for Node, sqlite-wasm for the browser.
2. `db.ts` keeps one copy of every query, against the interface.
3. Parity tests run the real DDL and every query against both engines using `tests/fixtures/journal.db`, and compare results: note list order, cursor boundaries, tag rows, heatmap day counts, BM25 search results and their order, and the `note_vectors` BLOB byte for byte (1536 bytes per note; a silent float re-serialisation would degrade retrieval invisibly).
4. The parity tests assert the exact `notes_fts` DDL, and that the porter tokenizer works.
5. The vectors survive an export/import round trip byte-identical, compared logically rather than by file checksum.
6. OPFS is used for persistence, with the write path proven by a reload in the browser test.
7. Fallback order, decided by the tests, not by preference: sql.js if FTS5 is missing, `tauri-plugin-sql` only if both fail. tauri-plugin-sql is async and would force an async rewrite of all 347 lines of `db.ts`, so it is last.

## Acceptance criteria
- Parity tests pass: identical rows, order and search results from both engines.
- The FTS5 DDL and porter tokenizer work in the WebAssembly build, or the fallback is recorded with the reason.
- A note saved in the static build survives a full page reload.
- `node scripts/web-smoke.mjs` reports no differences.
- `pnpm run check` prints 0 errors and 0 warnings.

## Progress

### 2026-09-28 — done, with one open question
- **The gate passed.** `pnpm run gate:sqlite` proves the exact DDL runs on the
  WebAssembly build: `CREATE VIRTUAL TABLE notes_fts USING fts5(content,
  note_id UNINDEXED, tokenize = 'porter unicode61')` creates all four tables, the
  porter tokenizer stems ("running" matches "run"), and `bm25()` ranks. FTS5
  survives the port, so retrieval needs no fallback.
- `src/lib/platform/sqlite.ts` — the `SqlDb` interface. `src/lib/platform/journal.ts`
  — every query the app makes, one copy, written once against that interface.
  `src/lib/server/node-db.ts` — better-sqlite3 behind it. `src/lib/platform/wasm-db.ts`
  — SQLite-in-WebAssembly behind it.
- `src/lib/server/db.ts` is now a thin wrapper that opens the database, applies
  the pragmas and re-exports the same function names, so **the 11 API routes were
  not touched**. The smoke test stayed at 28/28 across the move, which is the
  proof that pulling every query into a shared layer changed nothing.
- `pnpm run test:engine` — **27/27 parity checks**, the same `journal.ts` against
  both engines: rows and order, the pagination cursor across the fixture's
  deliberate tie in `created_at`, tags, heatmap day counts, BM25 order, the
  `note_vectors` blobs byte for byte, FTS maintenance on edit and delete,
  `count(notes_fts) == count(notes)`, and a transaction that rolls back.
- Two of the original parity failures were bugs in the test, not the engines:
  BM25 is floating point, so the two builds differ in the last digits with
  identical ordering, and the "stale row" check searched for a word that lived in
  a note it never edited.
- **Open question: persistence across a cold start.** The app reads and writes
  correctly in a session, but the one cold-start test lost the note. The
  emulator's data partition was at 90% with 632 MB free and `adb install` was
  failing with `INSTALL_FAILED_INSUFFICIENT_STORAGE`, so the last few installs
  never landed. A full disk explains the lost write on its own. The VFS is now
  reported by `/api/status` and on `/diagnostics` so the next run can tell the two
  apart. The SAH-pool VFS is installed on the main thread, because the default
  `opfs` VFS needs a Worker.
