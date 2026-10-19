Status: [DONE]

# Restore every journal table

## Context
- `GET /api/export` streams the complete SQLite database, so todos, principles, comments and tag colors are already in every backup.
- `POST /api/import` copies only notes, tags, vectors, weekly recaps and ask history. A real restore therefore leaves To-Do groups/items, principles, comments and tag colors behind.
- The same route also drops `notes.featured` and `notes.video`, and the smoke test records `POST /api/import` as 403, so the restore path was never exercised.

## Requirements
1. Copy every current table inside the existing transaction: notes (with `featured` and `video`), note tags/vectors/comments, weekly recaps, ask history, todo groups/items/tags/comments, principles/tags/comments and tag colors.
2. Keep older backups working: copy only tables present in the upload and use defaults for missing columns. Leave live sections untouched when the backup has no table for them.
3. Rebuild `notes_fts` and return counts for notes, tasks and principles.
4. Update the restore copy and toast so they name every section.
5. Make the smoke test run a successful restore and assert the round trip.

## Acceptance criteria
- A backup from the current schema restores todos, principles, comments, tag colors, featured notes and videos.
- An old backup without those tables still restores the core journal.
- `POST /api/import` returns 200 in the smoke test with all phases and done counts.
- `pnpm run check` 0/0, `pnpm run build` + `build/index.js`, `pnpm test` green, `GET /` 200.

## Progress

### 2026-10-19 — started
- Confirmed the live database is half-restored and the full backup is `/home/cubiq/Downloads/fermentario-2026-10-17.db`.
- Rewriting the import route, UI feedback, smoke test and docs.

### 2026-10-19 — done
- `/api/import` now copies notes (with `featured`/`video`), note tags/vectors/comments, recaps, asks, todo groups/items/tags/comments, principles/tags/comments and tag colors. Old backups keep working through conditional tables and column defaults.
- Restore UI names every section; the toast reports tasks and principles; tag colors reload after a restore.
- `scripts/start.mjs` raises adapter-node's `BODY_SIZE_LIMIT` to 110 MB. A real 1.2 MB backup restored all 12 notes, 5 groups, 31 items, 3 principles and 1 tag color into a temp database.
- Smoke test now records a 200 import with every phase, plus a full export/restore read-back of each section. Baseline: 47/47.
- Gates: check 0/0, build + `build/index.js`, test 47/47, `GET /` 200.
