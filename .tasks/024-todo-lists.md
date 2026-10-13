Status: [DONE]

# To-Do lists and groups

## Context
- The To-Do section is the first real section after the shell (task 023). It needs lists of checkable items with the same tag system as notes, so tags stay one concept across the app.
- Items belong to a group (e.g. a project or area). The user names groups and renames them later. Renaming a group must not orphan or duplicate items.

## Requirements
1. To-Do lists with add, check/uncheck, edit, and delete per item.
2. Items carry tags using the same tag system as notes (same parsing, same chips, same tag pages where it makes sense).
3. Every list belongs to a group. The user creates groups and renames them; items follow the rename.
4. New tables for groups and items. `notes` and `note_tags` stay untouched.
5. Follows `docs/DESIGN.md` spacing, color, and typography. No new tokens without checking it.

## Acceptance criteria
- Add/check/edit/delete item works with persistence across reload.
- Tagging an item behaves exactly like tagging a note (parse, chips, filter).
- Renaming a group moves all its items with no orphans, verified by row counts.
- `pnpm run check` 0/0, `pnpm run build` + `build/index.js`, `pnpm test` 28/28, `GET /` 200.

## Progress

### 2026-10-12 — done
- Schema in `journal.ts` (`todo_groups`, `todo_items`, `todo_item_tags`, FK cascade), 12 helpers, re-exported from `db.ts` + client types in `$lib/types.ts`.
- Routes: `GET/POST /api/todo/groups`, `PATCH/DELETE .../groups/[id]`, `GET/POST .../groups/[id]/items`, `PATCH/DELETE /api/todo/items/[id]`. Trailing hashtags parse exactly like notes (create + edit); FK guard order fixed (existence check before tag write).
- `TodoTab.svelte`: group chips + inline rename + `ConfirmDialog` delete, item checkbox/edit/delete, tag chips link to tag pages. Wired as the `todo` view.
- User correction mid-task: pills carry no shortcut hints; sections use `G then 1–5` (800ms window, modifier-free so macOS capture is safe); hints render in the config Sections list only.
- Verified live on a throwaway DB (create/rename/delete group, create with `#tag`, toggle, delete — all 200, rename keeps items). Gates: check 0/0, build + `build/index.js`, test 28/28, `GET /` 200.

### Follow-up — item delete confirms
- The × button opened no confirm. It now arms a `confirmingItem` state rendering the shared `ConfirmDialog` (names the item, danger tone); confirm deletes, cancel clears. Gates re-run green: check 0/0, build + `build/index.js`, test 31/31, `GET /` 200.

### Follow-up — New group behind a + pill
- The always-visible form is gone. A dashed `+` pill leads the group row; it expands to an inline input with Add/Cancel, `Enter` submits, `Escape` clears, autofocus on open, collapses after creation. Gates re-run green.

### Follow-up — visible grip handle for reorder
- Each item row leads with a grip handle (`GripVertical`, `cursor-grab`, tooltip "Drag to reorder"). Drags start from the handle on mouse and touch (touch needs no hold there); arrow keys on the handle reorder for keyboard users. Fixed a style leak where an immediate touch drag left `touch-action: none` on the row. Gates re-run green.