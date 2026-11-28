# Tools

## `node scripts/test-vault.mjs` — vault browser smoke test

Runs against the local dev server at `http://127.0.0.1:4173/`. Set
`VAULT_TEST_URL` to use a different server, or `CHROME_PATH` to select Chrome.
It creates synthetic AES and Argon2id databases in memory and tests wrong
passwords, unlock, search, password reveal, modal state, manual and idle lock,
and checks that synthetic secrets do not appear in network requests. It does
not read a real vault.
Optionally set `VAULT_TEST_FIXTURE` to a synthetic KDBX with master password
`test-master` and an entry named `Synthetic account` with password
`fixture-secret`, to test an independently generated file as well.

## `pnpm test` — web app regression gate
`node scripts/web-smoke.mjs`

Boots the production entry (`node scripts/start.mjs`, which runs `build/index.js`
and attaches the Nostr relay) on a temporary port against a copy of the frozen
fixture, exercises every page and every API route, and compares the result with
`tests/baseline/web.json`. 203 checks. The export/import round trip creates one
row in every section, restores the exported file, and reads every section back
through the API. The Nostr block uses a throwaway key, publishes through the
API, reads the result over a WebSocket from `/relay`, refuses a foreign author,
and accepts an owner write over the socket — all against the local relay. It
then stops the relay, proves the handshake is refused (while NIP-11 still
answers), and starts it again.

| Command | What it does |
| --- | --- |
| `pnpm test` | Compare against the golden. Exits 1 on any difference. |
| `pnpm run test:web:update` | Rebuild the fixture and rewrite the golden. Read the diff. |
| `pnpm run fixture` | Rewrite `tests/fixtures/journal.db` only. |

Rules that keep it a real gate:
- It never opens `data/fermentario.db`. Every run copies the fixture into a temp directory, then the first boot imports it into `data/journals/<id>/journal.db` and removes the legacy path.
- It downloads nothing. `scripts/offline-guard.mjs` rejects the Hugging Face hosts, so the background `ensureIndexed()` pass fails fast instead of pulling 22 MB of weights.
- `TZ=UTC` fixes the heatmap day keys, which are computed with `localtime`.
- The model cache is an empty temp directory, so no 488 MB model loads.
- `FERMENTARIO_NOSTR_RELAYS` points discovery and publish at the run's own
  `/relay`, so the Nostr checks never reach a public relay.
- Runtime values — fresh UUIDs, fresh timestamps, the temp path — are masked once at serialization time.
- A changed set of check names is a failure. The golden is not silently rewritten.

## `pnpm start` — production server
`node scripts/start.mjs`

Sets `BODY_SIZE_LIMIT=110M` (unless the deployment already sets it), loads
`build/index.js`, then attaches the Nostr relay (`scripts/relay.mjs`) to the
HTTP server adapter-node created. adapter-node's 512 KB default rejects a real
database restore before the route can run. `ORIGIN` is still
deployment-specific: set it when the app runs over plain HTTP behind a proxy, or
the import form fails the CSRF origin check.

A reverse proxy in front of the app must forward `Upgrade` and `Connection` for
`/relay`, or the WebSocket handshake fails. `GET /relay` returns the NIP-11
document; `wss://<domain>/relay` is the address other clients add.

On first boot, if `data/registry.db` has no journal and `data/fermentario.db`
exists, the server copies the old file into `data/journals/<id>/journal.db`,
migrates it, activates it, and removes the old file. The copy is kept under
`data/backups/<id>/pre-migration-v0.db`. Stop the old server before this boot;
the import assumes one writer. If the import fails, the app shows
`/journal-error` and leaves the old file untouched.

## `scripts/relay.mjs` — embedded Nostr relay
There is no separate command. `scripts/start.mjs` attaches it to the production
HTTP server; `vite.config.ts` attaches the same module to the dev server, with
`strictPaths: false` so Vite's HMR socket keeps working. It handles the
`upgrade` for `/relay` and speaks a NIP-01 subset: `EVENT`, `REQ` (one or more
filters, `ids`, `authors`, `kinds`, `since`, `until`, `limit`, `#tags`),
`CLOSE`, with `OK` / `EOSE` / `CLOSED` / `NOTICE` replies.

- Writes are restricted to the account's pubkey (`nostr_profile` in the active
  journal), verified with `verifyEvent`. Everything else gets `OK false`
  `restricted`. There is no AUTH; reads are open.
- Events land in the active journal's `nostr_events` table (`INSERT OR IGNORE`
  by id), so the admin section and a `REQ` read the same rows. `account_id`
  and `pubkey` both hold the author's hex key. The relay keeps
  its own `better-sqlite3` connection and reopens it when the registry's active
  journal changes.
- Limits: 64 KB per message, 20 subscriptions per connection, `limit` capped at
  500, 2000 events per `REQ`.
- `FERMENTARIO_DATA_DIR` locates `registry.db`; `GET /relay` serves the NIP-11
  document from `src/routes/relay/+server.ts`.
- `GET /api/nostr/relay` reports `{ running, url }`; `POST` with
  `{ running: boolean }` flips the `relay_enabled` key in the registry's
  `app_state`. The upgrade listener reads that key on every connection and
  destroys the socket when the relay is stopped. The Nostr section's dot and
  `Start relay` / `Stop relay` button use this pair. The flag survives a
  restart, so stop it in production before a port move if needed.
- `POST /api/nostr/sync` is one page of the backup, not the whole thing. Body
  `{ until?: number, limit?: number }` (`until` in unix seconds, `limit`
  capped at 500). It returns `{ imported, fetched, hasMore, nextCursor,
  stats, lastSyncAt }`: `nextCursor` is the oldest `created_at` of the page,
  and `hasMore` is true when the page added something new, so older events may
  exist. The section loops with a 2 s pause until `hasMore` is false; the
  newest batch first, which is also how new posts arrive. A second concurrent
  call gets `409` from an in-process guard. `lastSyncAt` is stored in the
  registry (`nostr_last_sync_at`) and also returned by
  `GET /api/nostr/profile`. Duplicates across relays are dropped by event id
  (`nostr_events.id` is the primary key, `INSERT OR IGNORE`).

## `pnpm run db:migrate:all` — migrate every journal
`node --experimental-strip-types scripts/migrate-all.ts`

Reads `data/registry.db` and applies pending migrations to every registered
journal. Run it before starting a new production build after a schema change.
Each journal gets a backup under `data/backups/<id>/`, the five newest are
kept, and `journals.schema_version` is updated. A journal newer than the app
fails the command instead of being opened.

Development does not need this command: opening a journal runs the same
migrations automatically.

## `pnpm run test:onboarding` — welcome, create, restore gate
`node scripts/onboarding-smoke.mjs`

Starts the production build against throwaway data directories and checks:
1. no journal redirects `/` to `/welcome`, data APIs return 409 `NO_JOURNAL`,
   and `POST /api/journal` creates a schema-only journal;
2. restoring the frozen fixture creates and activates a new journal with five
   notes;
3. a broken active journal redirects to `/journal-error` and can be replaced by
   restoring a backup;
4. an invalid upload reports an error and leaves no journal behind.

It also asserts that the welcome page offers an empty journal, that a second
create returns 409, and that the new database contains every table with zero
rows. Run it after changes to `src/hooks.server.ts`, the journal registry, the
onboarding routes or the restore core.

## `pnpm run fixture` — frozen test database
`node scripts/make-fixture.mjs [output-path]`

Writes `tests/fixtures/journal.db`: 5 notes, 5 tag rows, 1 recap, 1 ask row, 5 vectors, 77 KB. Everything is fixed — UUIDs, timestamps, and 384-dim float32 vectors from a deterministic function.

The fixture deliberately uses the pre-migration schema (no To-Do, principles
or schema tracking tables). The first-boot import and the smoke test therefore
exercise the baseline migration instead of a database that is already current.

It is synthetic on purpose. A golden built from the real journal would carry personal text into every diff, and would change whenever a new note was written, which hides real regressions.

Two notes share a `created_at`, so the `(created_at, id)` pagination cursor is exercised: any change to the ordering shows up as a reordering in the golden.

Built with better-sqlite3, because that build has FTS5. The system `sqlite3` CLI on this machine does not.

## `scripts/offline-guard.mjs` — test-only network guard
Loaded into the smoke-test server with `--import`. Active only when
`FERMENTARIO_TEST_OFFLINE=1`.

Rejects requests to the Hugging Face hosts and passes everything else to the
real `fetch`, so SvelteKit's own server-side fetch is unaffected. Without it,
every test run downloads model weights, because `GET /api/notes` starts the
background indexing pass.

## scripts/reader-webkit-check.mjs
End-to-end EPUB reader check on the REAL WebKit engine (the iPhone Safari
engine) via `playwright-core` and the cached Playwright WebKit browser.
Boots `build/index.js` against a throwaway copy of the fixture, uploads a
Gutenberg EPUB through `POST /api/books`, opens `/admin/book/[id]`, makes a
programmatic selection inside the content iframe, and asserts: the
selection toolbar appears from the capture poll, the highlight saves with a
`epubcfi(...)` range, the SVG mark renders, and the toolbar does not ghost
back, and a trusted mouse drag inside the sandboxed iframe reaches the
parent capture (the same native-delivery path a finger takes).

    pnpm run build
    curl -L -o /tmp/pg84.epub https://www.gutenberg.org/cache/epub/84/pg84.epub   # once
    node scripts/reader-webkit-check.mjs [path/to/book.epub]

Exits non-zero with the server/browser diagnostics on the first failed
step. If Playwright updates its browser revision:
`node node_modules/playwright-core/cli.js install webkit`.

## Future: engine parity tests
Task 020. Will run the real DDL and every query against both better-sqlite3 and
`@sqlite.org/sqlite-wasm` using the same fixture, and compare rows, ordering,
BM25 results and the vector blobs byte for byte.

## Market quotes

- `POST /api/quotes/refresh` body `{ ticker }` refreshes one ticker: its auto-priced holdings rows (`price_auto = 1`; never cash and never a hand-set price) and its trading quote, then returns `{ ticker, ok, price, previousClose, source, error, summary }`. A missing ticker is 400; an upstream failure is a 200 with `ok: false`, like `/api/market/refresh`.
- `POST /api/market/refresh` is the global Update and is unchanged: one forced holdings refresh plus every open trading ticker.
- The client dispatches `trading:changed` after a single-ticker refresh so the trading strip and the Trading page reload their quotes.

## Time tracker

- Page: `/tools/time-tracker`. The tool page is outside `/admin` and reads no admin context, so it works without the admin shell.
- Routes: `GET /api/time-tracker` returns `{ running, entries }`; `GET /api/time-tracker?tag=<tag>` returns `{ entries }` for one tag (running first, cap 200, empty list for a blank tag); `PATCH /api/time-tracker/<id>` body `{ comment }` rewrites the comment and its hashtags on a running or stopped entry (404 if missing); `POST /api/time-tracker/start` body `{ comment }` creates a running entry (409 if one is already running); `POST /api/time-tracker/stop` body `{ id? }` stops the running entry (409 if none running); `DELETE /api/time-tracker/<id>` deletes one entry, running or stopped (404 if missing), and its tag rows; `GET /api/time-tracker/stats?period=month|week|year&at=<iso>` returns aggregated buckets/segments for the period chart.
- Tags/projects: hashtags anywhere in the start or edit comment are parsed with `splitHashtags`. A tag starts the line or follows whitespace and ends at whitespace, so URL fragments and `# Heading` stay prose. The comment is stored without the tags and tags are stored in `time_entry_tags` (migration 34). Migration 38 still uses the frozen `splitTimeEntryHashtags` to backfill leading-run tags for older entries. Stats attribute each entry's duration to its first tag (primary project); untagged time is a neutral segment.
- Journal tables: `time_entries` (migration 33, `time-tracker`), `time_entry_tags` (migration 34, `time-entry-tags`). One running timer at a time (`ended_at IS NULL`).

## Shortcuts

- `src/lib/shortcuts.ts` is the only shortcut registry. `HelpModal` renders it;
  `MiniAppDef.shortcut` carries the mini app keys.
- Current: `Mod+K` search, `1–5` admin section, `Mod+Shift+L` new note,
  `Mod+Shift+A` add item, `Mod+Enter` save, `Esc` close,
  `Enter` start timer, `↑/↓` and `Enter` in search.
- Slogan and meta description: `SLOGAN` in `src/lib/brand.ts`
  (`Your sovereign life's dashboard`); migration 40 replaces the old
  `Published notes.` default in `public_config`.

## Global search

- `GET /api/search?q=` returns hits from notes, tasks, principles, holdings
  (tickers) and trading (venues and their tickers). A holding opens
  `/admin/stocks`; a trading hit opens `/admin/businesses/trading/<org>`.
- Trading ids are `<org>|<ticker>`; `searchHref` splits on `|`, so one ticker
  from Ripio and the same ticker from B3 stay separate rows.
