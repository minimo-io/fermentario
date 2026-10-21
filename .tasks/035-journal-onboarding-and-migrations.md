Status: [DONE]

# Journal onboarding, per-user databases and migrations

## Context
- `src/lib/server/db.ts` currently opens `data/fermentario.db` at module load and creates the schema there. The app cannot represent a missing journal.
- The existing database must be imported once into a normal journal directory, then the old file must stop being used.
- Future login will map different users to different SQLite files with the same schema. Schema migrations must reach every live journal.

## Requirements
1. Add a registry database at `data/registry.db` with journals and active-journal state.
2. Move journals to `data/journals/<id>/journal.db`. Import `data/fermentario.db` automatically on first boot, migrate it, activate it, and remove the old file only after success.
3. Keep the app usable after the one-time import. Do not show the welcome screen when an active journal exists.
4. Add `/welcome` with create-empty and restore-backup actions. A blank journal has schema only.
5. Add a migration system with `schema_migrations`, ordered migrations, per-journal version tracking, pre-migration backups and a bulk migration command.
6. Add server-side gating so data APIs return 409 when no journal exists and pages redirect to onboarding.
7. Refactor restore so the active journal restore and onboarding restore share validation and copy logic.
8. Prepare request-scoped journal resolution for future login, without building login now.
9. Add tests, docs, and pass all four gates.

## Acceptance criteria
- A fresh data directory shows `/welcome`; creating an empty journal opens `/` with zero notes and a full schema.
- A data directory containing the old `data/fermentario.db` imports it once, preserves the rows, activates it, and removes the old file.
- A second boot does not import again.
- Restore at onboarding creates a new active journal; a failed restore leaves the old state unchanged.
- Existing active-journal restore still works.
- Migrations are idempotent, tracked per journal, backed up before applying, and can run for all journals.
- No data API can run without an active journal.
- `pnpm run check` 0/0, `pnpm run build` writes `build/index.js`, `pnpm test` is green, and `GET /` returns 200.

## Progress

### 2026-10-20 — started
- Task created. Implementing the plan in phases: registry and legacy import, migrations, lazy DB, hooks/onboarding, restore refactor, UI, tests and docs.

### 2026-10-21 — completed
- Added `data/registry.db` and `data/journals/<id>/journal.db`.
- Added one-time legacy import with `VACUUM INTO`, pre-import validation, backup, migration, activation, and old-file removal.
- Added per-journal `schema_migrations`, baseline migration 001, backups, auto-migration on open, and `pnpm run db:migrate:all`.
- Added `hooks.server.ts` gating, `/api/journal`, `/api/journal/restore`, `/welcome`, `/journal-error`, and the shared onboarding UI.
- Split restore into shared validation/copy helpers. Active restore and onboarding restore now use the same core.
- Made `db.ts` lazy and reset journal-scoped RAG, tagging and summary caches on journal changes.
- Added animated note fold/unfold and removed the home-page tagline.
- Added `pnpm run test:onboarding` and first-boot assertions to the web smoke test.
- Updated `docs/DESIGN.md`, `docs/TOOLS.md` and `docs/lessons-learned.md`.
- Gates: `pnpm run check` 0 errors/0 warnings; `pnpm run build` clean and `build/index.js` exists; `pnpm test` 47/47; `pnpm run test:onboarding` passed; `GET /` returned 200 with real data.
