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