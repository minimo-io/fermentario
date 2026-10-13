Status: [DONE]

# YouTube reference on a note

## Context
- Some notes point at a video. A YouTube URL attached to the note renders a player at the bottom of the note card, so the reference is watchable where it is read.
- The URL is validated as YouTube on the way in (same normalize-on-input rule as tag removal). Anything else is rejected with the real reason, never stored.

## Requirements
1. Optional YouTube URL per note, set at creation and editable later (single-note view, task 032, and the note action menu where it fits).
2. The note card renders the embed at the bottom of the card. No autoplay, no layout shift: the player slot reserves its space.
3. Export/copy includes the URL as text. Delete removes it with the note (same row, no orphan table if a column is used; a child table must cascade).
4. Private/unlisted URLs are the user's own business — no validation beyond YouTube-shapeness.

## Acceptance criteria
- A valid YouTube URL saves and renders a player at the card bottom; an invalid URL is rejected with a message and stores nothing.
- Edit changes the video; delete removes it; export carries the URL.
- `pnpm run check` 0/0, `pnpm run build` + `build/index.js`, `pnpm test` 28/28, `GET /` 200.

## Progress

### 2026-10-12 — done
- `notes.video` column (schema + migration), stores the 11-char id only. `src/lib/youtube.ts` parses watch/short/embed/live/shorts URLs, rejects the rest. `setNoteVideo` touches only its column.
- `POST /api/notes` and both `PATCH` paths accept video (400 on non-YouTube). `VideoEmbed.svelte`: click-to-load thumbnail reserving 16:9, no third-party request until asked. Card renders it at the bottom; `EditNoteDialog` gained a URL field; clipboard export appends the watch URL.
- Intended golden change recorded (`+video:""` only). Verified live: create/set/clear/reject. Gates: check 0/0, build + `build/index.js`, test 28/28, `GET /` 200.