Status: [DONE]

# Download the database without navigating

## Context
- Tapping "Download database" in the Config modal replaced/reloaded the app instead of only saving the file. The element was a plain same-origin `<a href="/api/export" download>`.
- SvelteKit does NOT intercept it: `get_link_info` marks a same-origin href with the `download` attribute as a download (`utils.js:150`) and the delegated click handler bails at `if (download) return;` (`client.js:2742`). A fetch of `/api/export` also produced no "page reload" line in the Vite log, so neither the router nor the watcher explained it.
- That leaves the browser: iOS Safari frequently ignores `download` on a same-origin URL and performs a real navigation, which is exactly the "the app reloaded" report, and the app is used over the tailnet URL on a phone.

## Requirements
1. The download must never navigate, on any browser, including iOS Safari.
2. The anchor keeps its `href` and filename so it degrades to a plain download without JavaScript.
3. The user gets feedback while the download runs, and a visible error when it fails.
4. The dev server must not react to database writes, which live inside the project directory.

## Acceptance criteria
- The file downloads and the app keeps its state: no navigation, no reload, modal stays open.
- The export route still answers 200 with `application/vnd.sqlite3` and a `Content-Disposition: attachment` filename.
- `pnpm run check` prints 0 errors and 0 warnings.

## Progress

### 2026-09-24 — done
- ConfigModal: the anchor's click is intercepted, the response is fetched and read as a `Blob`, and the save is triggered from an object URL. The injected anchor is appended to `<body>` (Firefox needs it in the document), has a capture-phase `stopPropagation` so SvelteKit's delegated listener never sees the click, is clicked, then removed; the object URL is revoked after a tick. `blob:` downloads are honoured on iOS Safari where a bare `download` attribute is not.
- The anchor now also carries an explicit `download="fermentario-<date>.db"` filename, in addition to the server header.
- Feedback: the link reads `Downloading…` while in flight and is dimmed, and failures render under it in the modal, next to the existing restore error.
- `vite.config.ts` gained `server.watch.ignored: ['**/data/**']`, so writes to the SQLite files cannot trigger a dev reload whatever the cause.
- The export route is unchanged: still checkpoints the WAL and streams with the attachment header. Verified after the change: 200, `application/vnd.sqlite3`, `attachment; filename="fermentario-2026-09-24.db"`, and `PRAGMA integrity_check` on the downloaded copy returns `ok`.
- `pnpm run check` 0/0, `build` clean, `GET /`, `/api/notes`, `/tags/garden`, `/heatmap` 200. `createObjectURL` is present in the built client chunk.
- The dev server had to be restarted because `vite.config.ts` changed (Vite restarts on config edits); the log file was gone, so it was relaunched writing to /tmp/ferm_dev.log. Data verified intact: 4 notes, 3 tag rows, 4 ask entries.
- Needs the user's browser to confirm no reload, especially on the phone.
