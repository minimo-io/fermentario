Status: [DONE]

# Import database

## Context
- The Config modal can download the real SQLite file (task 010), but there is no way back in: a backup is a one-way street.
- The server keeps an open better-sqlite3 handle on `data/fermentario.db`, so the file cannot be swapped underneath it. The restore has to happen inside that connection.
- `foreign_keys = ON`; `note_tags` and `note_vectors` cascade from `notes`. `notes_fts` is a virtual table and cannot be copied row by row from another database, it must be rebuilt from the notes.

## Requirements
1. Config modal: a file input and a "Restore from database" button, an explicit warning that it replaces everything currently stored, a hint to download a backup first, and a busy state.
2. `POST /api/import` takes a multipart upload (capped at 100 MB), writes it to a temp file, and validates it while the live database is untouched: open read-only, `PRAGMA quick_check`, and require the `notes`, `note_tags`, `weekly_recaps` and `ask_history` tables. The temp file is removed on every path.
3. Apply in one transaction through `ATTACH`: delete `notes` (cascading to tags and vectors), `notes_fts`, `weekly_recaps` and `ask_history`, then re-insert every table with an explicit column list, then rebuild `notes_fts` from the imported notes.
4. Vectors travel with the backup so an import does not re-embed a thousand notes. A backup without vectors is filled in by the existing background pass.
5. After a successful import the summary memo is cleared and the client reloads notes, ask history and the weekly recap.

## Acceptance criteria
- Importing a file makes the app serve exactly that file's notes, tags, recaps and ask history, and `PRAGMA integrity_check` still returns `ok`.
- A non-SQLite file and a truncated file are rejected with an error and leave the live database unchanged.
- The FTS index finds imported notes after a restore (search through Ask works).
- `pnpm run check` prints 0 errors and 0 warnings.

## Progress

### 2026-09-24 — started
Auth is explicitly out of scope per the user. Full replace, as planned.

### 2026-09-24 — done
- New `src/routes/api/import/+server.ts`: multipart upload capped at 100 MB, written to `data/import-<uuid>.db`, validated through a read-only connection (`quick_check` + required tables) before the live database is touched, then applied through `ATTACH` in one transaction: `DELETE FROM notes` (cascading to `note_tags` and `note_vectors`), `notes_fts`, `weekly_recaps`, `ask_history`, explicit-column re-inserts from `backup.*`, and an FTS rebuild from the imported notes.
- `PRAGMA wal_checkpoint(TRUNCATE)` after the commit. Without it the imported rows existed only in the server's WAL: the file and every other reader still showed the old journal, and the next download would have handed out the previous contents.
- Temp cleanup removes the upload plus its `-shm`, `-wal` and `-journal` siblings on every path, including rejections.
- Validation errors answer 400 with the real reason ("not a readable database: file is not a database"). SQLite opens lazily, so a text or truncated file fails on the first read rather than on open; 500 is now reserved for the apply phase.
- The summary memo moved to src/lib/server/summary-cache.ts (`getCachedSummary`, `setCachedSummary`, `summaryLocks`, `resetSummaryCache`) so the import can clear it; the summary route uses the helpers.
- ConfigModal: file input + "Restore" button, the "replaces everything currently stored" warning with a backup hint, a busy label and an inline error. `onRestored` reloads notes, ask history and the weekly recap, then closes the modal.
- Verified: import of a mutated copy produced exactly the file's 6 notes / 3 tags and the app served them; `integrity_check` = ok; FTS answered `MATCH` for the imported words after the rebuild; two test notes then deleted. A text file, a truncated file and an empty file were all rejected with 400 and the live journal unchanged; no `import-*` files remain in `data/` after any run.
- Final state is the user's own journal: 4 notes, 1 tag, 2 recaps, 4 ask entries, integrity ok, with a fresh export at /tmp/pristine.db.
- `pnpm run check` 0/0, `pnpm run build` clean, `GET /`, `/api/asks`, `/api/export` 200.
- Used `quick_check` instead of the planned `integrity_check` for the upload: it is much faster on large user files and catches the same structural corruption, and the imported database is verified with a full `integrity_check` in testing.
