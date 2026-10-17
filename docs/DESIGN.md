# Design Principles

The single source of truth for layout, spacing, color, typography and component
sizing. Consult this before changing any of them.

## Layout

- **Page container** (every route): `mx-auto max-w-2xl px-6 pt-14 pb-24`.
  The width follows the Column width setting (Narrow `max-w-xl`, Standard
  `max-w-2xl`, Wide `max-w-4xl`); one value drives every route so the heatmap,
  the timeline and the tag pages line up on desktop. The heatmap is the one view that needs more room than
  672px for its 53-column grid, so its grid scrolls horizontally inside the
  container rather than widening the page.
- **Composer** (fixed bottom bar): `mx-auto max-w-2xl px-6 pb-8`. Same width as
  the page, so the bar and the content align with no gap.
- **Bottom clearance**: the page reserves `pb-[calc(var(--composer-h,4.5rem)+2.5rem)]`
  so the last note is never hidden behind the bar. The bar publishes its height
  as `--composer-h` via a `ResizeObserver`.
- **Breakpoints**: mobile-first. `sm:` (640px) is the only breakpoint in use,
  for the desktop adjustments already present (composer padding, modal placement,
  heatmap height).
- **Task rows (To-Do)**: pills — status, tags, comment count — share one wrapped
  row under the title on mobile (< `sm`, `pl-12` indent); the comment pill is
  pushed to the card's bottom-right edge with `ml-auto` (a bare row right-aligns
  it on its own line). On desktop the same pills move inline into the title
  line, right-aligned just before the `⋮` actions button (`hidden sm:flex` on
  the inline group, `sm:hidden` on the stacked row). Principle cards follow the
  same rule (their chips row is right-aligned; `px-4` padding). Existing pills
  render twice in the DOM, once per breakpoint; do not re-stack them on
  desktop. The title line is `items-start sm:items-center`: mobile keeps
  first-line alignment, on desktop every element shares the ⋮ button's vertical
  centre. Right-align by flex (`ml-auto`), never `position: absolute` — an
  absolute pill overlays the open thread's Add form.
- **Comments standard (all surfaces)**: there is no comment input outside a
  modal and no comment list in any list row. The modal only takes text for
  ONE new comment (`CommentModal`: plain "Add comment" title, textarea,
  Add button below the textarea right-aligned like every form dialog) and
  closes itself after the comment is stored — it never shows a thread and never deletes.
  The comment list lives ONLY on the single item page
  (`/todo/[id]`, `/notes/[id]`, `/principles/[id]`): read-only rows with
  date + confirmed `×` delete (danger `ConfirmDialog`, `aria-label="Delete
  comment"`), plus an "Add comment" button that opens the same modal.
  The count pill on list cards is the add entry point everywhere
  (`aria-haspopup="dialog"`). Comment routes and count bookkeeping stay per
  surface. Notes carry the same standard end to end since: `note_comments`
  table + `/api/notes/[id]/comments(-/[commentId])` routes,
  `Note.commentCount` batched with the tags query, the pill on note cards
  in every timeline mount (bottom row on mobile, inline before the ⋮ on
  desktop) and a module-shared delta map so both mounted timelines show
  the same count. Principles have a single page too
  (`/principles/[id]`, reached through the card actions menu's first
  "Open" item); it renders content, tags, video and the comments section.
- **Notes fold + markdown**: any note longer than one rendered line folds
  to one clamped line (native `line-clamp` ellipsis) when you tap the note
  text, and expands on tap again — long paragraphs without newlines are
  foldable too (foldability is measured from the rendered height, not
  counted from newlines). A persisted fold is trusted without re-measuring.
  Short notes stay plain, non-tappable text. Tags, video pill, featured
  star and amber border stay visible while folded. Folds persist in
  `localStorage` (`ferm:collapsed-notes`, array of note ids) across reloads until
  expanded. THE FOLD MAP IS MODULE-STATE, SHARED BY EVERY MOUNTED TIMELINE:
  the home page (and tag pages) render two timelines at once (featured
  section + history) that hold the same ids, so a per-instance map with a
  shared storage key let the last fold wipe earlier ones. Storage loads
  once per page view and is only pruned on expand. Note text renders light
  markdown — `**bold**` and `*italic*` only
  (`src/lib/markdown-inline.ts`, escape-first then two tag rules) — in the
  timeline (folded and full) and the note page; editors, copies and
  exports stay raw.
- **Note card gestures**: tapping the note text only folds/unfolds —
  opening a note lives in the ⋮ menu ("Open note"; not offered by the ⋮
  menu on the note's own page). The hour stamp is a label, not a link. On
  mobile the ⋮ floats absolute in the top-right corner (translucent white
  circle so overlapped text stays readable) and the note text spans the
  full card width; on desktop the ⋮ stays inline after the text. The
  `edited` marker is left-aligned on mobile, right-aligned on desktop. The
  same absolute top-right ⋮ applies to the single-note page's article.
  Stretch caveat: the card's inner content row carries `max-sm:w-full` —
  under `items-start` + `max-sm:flex-col` a flex child otherwise shrinks
  to its content width, which broke full-width text and pulled the pill
  row to a mid-card edge on short notes.

## Spacing

A `0.5rem` rhythm. The values already in use:

| Token | Value | Used for |
|---|---|---|
| `gap-1` | 0.25rem | chips, tight rows |
| `gap-2` | 0.5rem | buttons, list items |
| `gap-3` | 0.75rem | card internals |
| `mt-2` / `mb-2` | 0.5rem | chip rows, small separators |
| `mb-4` | 1rem | day sections, card groups |
| `pt-14` | 3.5rem | legacy page top (retired: no fixed header anymore; the page uses `pt-[max(1rem,env(safe-area-inset-top))]`) |
| `pb-24` | 6rem | page bottom |
| `px-6` | 1.5rem | horizontal page and composer padding (page uses `px-2` below `sm`) |

Do not introduce a new spacing value without checking this table first.

## Color

- **Neutral**: the Tailwind `stone` scale. `stone-100` fills, `stone-200` empty
  heatmap cells, `stone-300` borders, `stone-400` secondary text, `stone-500`
  chip text, `stone-600` buttons, `stone-900` primary actions and headings.
- **Heat**: the `amber` scale, five steps by note count (`amber-200` → `amber-500`),
  relative to the busiest day. `stone-200` is the single neutral for every day
  without notes, past or future.
- **Danger**: `rose-600` text, `rose-50` fills, `rose-300` borders, for delete and
  destructive confirmations.
- **Success**: `emerald-600` text, `emerald-50` fills, for confirmations.
- **Accent**: `amber-400/50` for the weekly recap and processing states.
- **Video**: notes and principles can carry a YouTube video, marked with a
  `red-600` pill (the brand red — the one deliberate exception to the palette).
  The pill toggles the click-to-load embed below it.

## Typography

- Scale: `text-[10px]` (metadata, heatmap labels), `text-[11px]` (chips, hints),
  `text-xs` (12px, buttons), `text-sm` (14px, body secondary), `text-[15px]`
  (note content), `text-2xl` (page headings).
- Section headers: `text-xs font-medium uppercase tracking-widest text-stone-400`.
- Day headers in the timeline are the exception: normal case, because they read
  as words ("Today", "Yesterday").

## Component widths

Pick an existing size instead of inventing a new one:

| Component | Width |
|---|---|
| ConfirmDialog | `max-w-xs` |
| CommentModal | `max-w-sm` (input only: title, textarea, Add) |
| NoteActionsMenu, ConfigModal, RestoreOverlay | `max-w-sm` |
| EditNoteDialog | `max-w-md` |
| CopyFallback | `max-w-lg` |
| ModelsModal | `w-[min(92vw,30rem)]` |

## Interaction

- **Destructive actions** (delete note, remove tag, restore database) always go
  through `ConfirmDialog` in `danger` tone.
- **Overlays** are `fixed inset-0 z-50` with a `stone-900/40` backdrop; the
  backdrop click and `Escape` close them, except while a long operation runs.
- **Toasts** are `fixed inset-x-0 bottom-28 z-30`, auto-clearing (4 s error,
  8 s success).
- **Hover-only controls** must also appear on `focus-visible` so keyboard users
  can reach them.
- **Auto-growing inputs** grow with their content and publish their height so the
  page can reserve space.

## Content rules

- Day headers in the timeline show `Today` / `Yesterday` as English literals and
  older days in the configured language's format (`Intl` output only, no
  hand-written translations).
- The heatmap packs the year's days seven per column from 1 January, so the grid
  is one rectangle with any slack at the bottom right.
- Tag chips are links to `/tags/<tag>`; when a removal handler is present they
  also carry a hover `×` that asks for confirmation.
