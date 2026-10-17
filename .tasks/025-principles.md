Status: [DONE]

# Principles list

## Context
- The Principles section is a plain numbered list of the user's principles. It needs an add button on its route and drag-and-drop reorder on desktop and mobile, with the order persisted.
- Numbering is positional (1, 2, 3…), derived from the stored order, never stored on the row — the same rule as heatmap day keys: keep the machine key stable and derive the display.

## Requirements
1. A Principles route with an add button that appends a principle.
2. Edit and delete per principle.
3. Drag-and-drop reorder with mouse and touch. The order persists across reloads and renumbers automatically.
4. New table for principles. No shared state with notes or to-do items.
5. Follows `docs/DESIGN.md` spacing, color, and typography.

## Acceptance criteria
- Add/edit/delete principle works with persistence across reload.
- Drag reorder (mouse and touch) changes the persisted order; numbers always read 1..N with no gaps.
- `pnpm run check` 0/0, `pnpm run build` + `build/index.js`, `pnpm test` 28/28, `GET /` 200.

## Progress

### 2026-10-12 — done
- `principles` table (`position` ordering), 6 helpers in `journal.ts`, re-exported + client type. Routes: `GET/POST/PUT /api/principles` (PUT takes full ordered id list, one transaction), `PATCH/DELETE /api/principles/[id]`.
- `PrinciplesTab.svelte`: numbered rows, add/edit/delete, pointer drag (mouse immediate, touch 280ms hold), order persists via PUT.
- Verified live on throwaway DB: reorder Third:0,First:1,Second:2; edit; delete; final list correct. Gates: check 0/0, build + `build/index.js`, test 28/28, `GET /` 200. Touch-drag needs a real device to feel.

### Follow-up — own bottom bar
- The add form moved into the shared `FixedBottomBar` (single row, compact mobile padding). The note composer no longer renders in Principles. Gates re-run green.

### Follow-up — principle tags + add modal
- `principle_tags` link table (FK cascade), same normalization as notes/tasks. Tags parse on create/edit, strip from stored text, return on every principle; chips render in the list, tag route gains a Principles group (`GET /api/principles?tag=`). New tables need no migration.
- Creation moved to a "New principle" modal (same pattern as tasks). Verified live: tag/edit/untag, grouped lookup. Gates re-run green.

### Follow-up — principle action sheet + comments
- Ellipsis opens the task-style sheet (Edit, Delete with confirm; delete also confirms now, previously immediate). Expandable per-row comment thread (count pill, slide, add form, confirmed delete) backed by `principle_comments` (FK cascade) + 3 routes. Verified live: add/list/delete. Gates re-run green.
### Follow-up — optional YouTube video
- `principles.video` stores the 11-char id (schema + `PRAGMA` migration for older tables). Create/edit accept a URL, validated by `extractYouTubeId` **before** any write, so a bad URL can never leave a phantom principle or a half-saved edit; empty string clears.
- Card shows the click-to-load `VideoEmbed` at the bottom; both modals carry a "YouTube URL (optional)" field, prefilled with the watch URL on edit.
- Mutual fix: the notes edit dialog re-sent the stored bare video id, so any text-only edit of a note with a video failed validation. It now prefills the watch URL and compares against it.
- Verified live: create with URL, text-only edit keeps video, bad patch 400 + content unchanged, bad create 400 + no phantom, clear works, embed renders, edit prefill correct. Gates re-run green (check 0/0, build + `build/index.js`, test 31/31, `GET /` 200).

### Follow-up — visible reorder grips
- Reordering existed (mouse body-drag, 280ms long-press on touch, `PUT /api/principles` with the full id list) but was invisible. Each card now carries the To-Do-standard drag grip before the number; a grip press engages the drag at once for mouse **and** touch (guaranteed drag), while press-and-hold on the body stays the touch fallback and `setPointerCapture` now engages on first move (the click-retarget fix the task rows already had). Arrow-up/down on the focusable grip reorders by keyboard.
- Verified live: 3 grips render; mouse body drag moves "P one" under "P two"; CDP-touch grip drag moves the last card to the top; a plain tap still opens the edit modal (no retarget). Gates re-run green.

### Follow-up — one comments standard (supersedes the inline thread above)
- The inline thread + inline age form on principle cards is gone. The count pill opens the shared `CommentModal` (`aria-haspopup="dialog"`); desktop tags + pill moved into the title line right-aligned before the ⋮ (`sm:items-center`, grip/number `sm:mt-0`), mobile tags row keeps its right alignment with the pill at the row end (bottom-right edge), bare card right-aligns the pill on its own line. Delete and add live only in the modal (delete with the internal danger confirm); the card pill's count follows. Verified live: pill right edge on the card padding line on the tags row and on the bare card; modal open, add (0→1), delete with confirm (1→0), tap still opens the edit modal. Gates re-run green.
