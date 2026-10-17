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

### Follow-up — action sheets for groups and items
- Inline rename/× buttons replaced by ellipsis buttons opening bottom sheets modeled on `NoteActionsMenu` (overlay, `Escape`/backdrop close, `min-h-11` targets). Item sheet: Mark done/not done, Edit, Delete (still confirmed). Group sheet: Rename (opens the existing inline rename), Delete (still confirmed). Same endpoints. Gates re-run green.

### Follow-up — sheet null bug (user-caught)
- Every sheet button nulled its state before reading the `{@const}` snapshot (`menuItem = null; … m.id`), and the const re-reads live — so all six buttons threw `Cannot read properties of null`. No fetch ever fired, which is why the network tab stayed empty. Fixed by capture-then-clear in all six handlers. Rule: never null state before its snapshot is consumed. Gates re-run green.

### Follow-up — in-progress items
- `todo_items.in_progress` (schema + migration), `PATCH` accepts it, list sorts in-progress first. Sheet entry toggles it; gold tag on TodoTab and tag-page rows. Verified live: mark/unmark, ordering, legacy-DB migration. Gates re-run green.

### Follow-up — multiline, detail page, done section
- Items render `whitespace-pre-wrap`; inline edit is an auto-growing textarea (`Cmd/Ctrl+Enter` saves). New `/todo/[id]` route (real 404): full content, tags, dates, toggle, comment history with add + confirmed delete. New `task_comments` table (FK cascade), `GET` single item, comment routes. Sheet + tag rows link to details.
- Done items live in a collapsed-by-default `Done (N)` section with `slide` animation; unchecking glides back up. Verified live: multiline round-trip, comments add/list/delete, 200/404s. Gates re-run green.

### Follow-up — section survives navigation
- Current view persists in `sessionStorage` (`fermentario.view`) on every switch and restores on mount, so Back from a task detail lands back in To-Do (or Ask), not Notes. Invalid values fall back to Notes. Gates re-run green.

### Follow-up — In progress pill + group modal
- Amber "In progress (N)" pill leads the group carousel: flat cross-group view with group names, gold tags, checkboxes, and its own action sheet (details/done/progress/delete). Backed by `listInProgressItems` + `GET /api/todo/items?inprogress=only`. Add bar hidden there (nothing to add to). Verified live across two groups.
- Group creation left inline for the modal: `+` opens a "New group" dialog (autofocus, `Enter` creates, `Escape`/backdrop closes), same `addGroup` path.

### Follow-up — subgroups via (name) prefix
- `src/lib/subgroups.ts` parses a leading `(v1)` token (lowercase alnum/dots/dashes); stored stripped alongside hashtag parsing on create + edit, so retyping the prefix moves the item and deleting it ungroups. `subgroup` column + migration (old rows ungrouped).
- List renders ungrouped items plus one togglable section per subgroup (count, slide, session-open). Edit field recomposes the prefix so it stays visible. Verified live: assign/move/clear, prefix-only 400, invalid chars left as text, legacy migration. Gates re-run green.

### Follow-up — New task modal
- The bottom bar holds only a full-width "+ Add" button (same shell, same height). It opens a "New task" modal with an auto-growing textarea, tag hint, and Create/Cancel (`Cmd/Ctrl+Enter` creates, plain `Enter` is a newline). Same `addItem` path. Gates re-run green.

### Follow-up — task edit modal, group reorder, rename modal, cross-group move
- Inline task editing replaced by a modal (auto-growing text, subgroup/tag hints, Save/Cancel, `Cmd/Ctrl+Enter`); row tap + sheet Edit open it.
- Group pills drag to reorder (mouse immediate, touch hold, arrows for keyboard) with persisted `position` + migration. Rename moved to a modal (autofocus, `Enter` saves).
- Dropping a task on another group pill arms a "Move to X?" confirm; confirm reassigns (appends at target end, tags/comments intact), bad groups 404. Pointer capture added so drops land. Verified live: move, reorder, rename, legacy migration. Gates re-run green.

### Follow-up — own bottom bar, single line
- The note composer no longer renders in To-Do. The add-item form moved into a shared `FixedBottomBar` (same slot, width, and `--composer-h` publishing as the composer): one row, `nowrap`, compact mobile padding. Gates re-run green.
### Follow-up — edit modal owns the full line; explicit group moves; drag fixes
- The edit modal now lists Group pills; picking another moves the task on Save (`PATCH group_id`, appends at the target's end, content/subgroup/tags intact).
- Edit prefills `(subgroup) text #tags` — PATCH re-parses the content, so a prefilled-without-tags edit silently wiped them (fixed).
- Mouse drags start anywhere on a task row again; pointer capture now engages on the first pointermove instead of pointerdown, because capturing on pointerdown retargets the subsequent click away from buttons (taps stopped opening the modal). `suppressClick` self-clears after 350 ms. Group pills and their grips stay tap-safe: pills open lists, grips reorder.
- Touch: hold the grip for a guaranteed drag; hold on a row body is best-effort (the browser may claim the gesture as scroll). Taps always work.
- Verified live (mouse + CDP touch): tap-to-edit, checkbox toggle, body reorder, drop-on-pill confirm→move, group reorder via grip, edit-modal group move; gates green.
- Follow-up: the edit modal's Group picker is now a native dropdown (`select`, one option per group) instead of pills — hundreds of groups stay usable. Same `editGroup` state and PATCH path. Verified live: preselected source, switch + save moves the task with tags intact. Gates re-run green.
- Follow-up — add shortcut + inline comments (principles standard): the Add button carries the desktop shortcut `⌘⇧A` (Mac) / `Ctrl+Shift+A` (Win/Linux) shown via `Kbd` (mobile hides the hint); the window listener registers only with `hover: hover` + `pointer: fine`, skips editable targets/composing, modals, and non-list contexts. Comment threads moved into the rows: always-visible count pill opens an inline thread (comment cards + date + confirmed `×` delete + add form), identical to principles; open rows, subgroup rows, and the in-progress list; done list stays compact; single task page unchanged. Verified live: shortcut opens the modal, typing inside a modal never re-triggers it, no shortcut on the touch context, hint visible on desktop; comment add bumps the count (1→2), confirmed delete removes it (→0), thread opens from the list. Gates re-run green.
- Follow-up — pill placement is responsive: on mobile (< `sm`) pills keep their own lines under the title (status, tags, comment count, `pl-12` indent); on desktop the same pills move inline into the title line, right-aligned just before the `⋮` button — in the In-progress view that line reads "task · AA Home · In progress · #tags · 💬 n · ⋮". Each existing pill renders twice in the DOM (one per breakpoint, hidden by `sm:hidden` / `hidden sm:flex`). Verified live: pills on the title line at desktop (Δtop 0 from the text, right of text, left of ⋮), stacked blocks `display:none` on desktop, inline group hidden on mobile with stacked blocks below the title as before; thread still opens below the row from the inline pill; progress view shows group-name + status + tags inline. Gates re-run green. Desktop-only `sm:items-center` on the three title lines (open, in-progress, done) with `sm:mt-0` on grip/checkbox — mobile keeps first-line alignment; desktop title, tags and pills now measure dead-on the ⋮ centre.
- Follow-up — comments corrected to ONE standard (supersedes the inline-thread line above): no inline thread, no inline input in any list. The count pill (`commentPill` snippet, `aria-haspopup="dialog"`) opens the shared `CommentModal` (thread + confirmed `×` delete + input/Add, `max-w-sm`, internal delete-confirm). Mobile pill stays bottom-right via the merged chips row; desktop pill stays inline before `⋮`; add/delete bump/adjust counts on the cards. Verified live: modal open, add (count 0→1), internal confirm delete (1→0), pill re-renders, no inline input anywhere on mobile or desktop. Gates re-run green.

### Follow-up — the comment standard now covers notes
- The note card was left out of the comments standard during the fold
  rewrites; it is back in, end to end: `note_comments` table
  (id, note_id, content, created_at — FK cascade plus an explicit cleanup
  in `deleteNote`), `Note.commentCount` computed in a batched query next to
  the tags batch (`commentsByNote`), exported `list/create/delete note
  comment`, routes `/api/notes/[id]/comments(+/[commentId])`
  (GET/POST/DELETE, 404 on unknown note or empty comment), a count pill on
  note cards in every mounted timeline (bottom row on mobile, inline before
  the ⋮ on desktop, `aria-haspopup="dialog"`) opening the shared
  `CommentModal` (title = first line of the note, thread + confirmed
  delete + Add), and a read-only "Comments" history with an "Add comment"
  button on `/notes/[id]` (deletes only in the modal; the load fetches
  comments alongside the note). Delta counts are module state so the
  featured + history timelines stay in step without a reload.
- The ⋮ on the single-note page now uses the same absolute top-right
  placement on mobile as the list cards (`relative` article +
  `max-sm:top-1 max-sm:right-2 max-sm:bg-white/90`).
- Verified live: API POST/GET/DELETE 200/201/200, count changes in
  `/api/notes`; pill bottom-right (Δright 17 / Δbottom 13 ≈ card padding);
  modal add (1→2) and confirmed delete (2→1); pill shows the shared count
  after modal close; detail history renders, Add via modal appends (1→2);
  detail ⋮ absolute top-right (Δtop 5, Δright 9); tag page shows the pill
  with the server count. Gate note for future fixtures:
  create-note tags come from trailing #hashtags inside the content — the
  POST body has no tags field, so seeding a tag page requires the
  hashtag form. Gates green: check 0/0, build + `build/index.js`, test 31/31
  (baseline updated for the new `commentCount` fields, diff reviewed),
  `GET /` 200.

### Follow-up — the modal is input-only; the list lives on the single page
- The comment standard changed again (supersedes every thread-in-modal line
  above): `CommentModal` now holds ONLY the input — plain "Add comment"
  heading (no item content in the title; the `title` prop is gone),
  textarea, Add button BELOW the textarea, right-aligned like the
  other form dialogs (`mt-3 flex justify-end`, disabled until text) — and
  closes itself after the comment is stored. No thread, no delete, no
  locale prop.
  Lists kept the pill as the add entry point; add bumps the count on the
  card state (todo items + progress items, principles, timeline delta map).
- The comment list moved to the single item pages as read-only rows
  (content, date, confirmed `×` delete via danger `ConfirmDialog` with
  `aria-label="Delete comment"`, confirm label "Delete comment") plus the
  existing "Add comment" button: `/notes/[id]` (was there without the row
  delete), `/todo/[id]`, and the NEW `/principles/[id]` — principle
  content, tags, video, created date, comments section. The page resolves
  the principle from `GET /api/principles` (the list stays small; no new
  single-principle endpoint) and fetches
  `/api/principles/[id]/comments`.
- The principle card actions menu gained "Open" as its first item
  (`goto /principles/[id]`) so the list is reachable; Edit and Delete
  follow as before. Principle list state no longer keeps
  `commentsByPrinciple`; the tab only counts.
- Verified live (fresh temp data, seeded): note pill → input-only modal →
  add closes it and bumps the count; `/notes/[id]` row delete
  2→1 with confirm; `/principles/[id]` renders content + comments, add
  1→2, delete 2→1; principles tab pill 2→3 through the modal; ⋮ "Open"
  navigates to the principle page; `/todo/[id]` input-only add 1→2,
  confirmed delete 2→1; no page errors. Gates green: check 0/0, build +
  `build/index.js`, test 31/31, `GET /` 200.
- Verify-script lessons recorded in `docs/lessons-learned.md`: a fresh
  `FERMENTARIO_DATA_DIR` is empty (empty state has no targets to click),
  and every card renders two pill/menu variants (one per breakpoint) —
  Playwright needs the `:visible` locator, not `.first()`.
