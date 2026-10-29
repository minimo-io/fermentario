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
  the page, so the bar and the content align with no gap. The full-screen note
  editor carries an optional date/time pill; an empty value uses the current
  time. The chosen time becomes the note's `created_at` and the card enters the
  timeline in date order, not always at the top. The edit forms (timeline
  dialog and single-note page) expose the same date/time field; a changed date
  reorders the card, and a date below the loaded page removes it from view with
  a scroll-down toast.
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
- **Comment count pills**: zero comments uses `bg-stone-100 dark:bg-stone-800`
  with muted text. A count above zero uses one darker step,
  `bg-stone-200 dark:bg-stone-700`, with darker text. The difference is subtle
  but visible at a glance, and the count remains the primary signal.
- **Comments standard (all surfaces)**: there is no comment input outside a
  modal and no comment list in any list row. The modal only takes text for
  ONE new comment (`CommentModal`: plain "Add comment" title, textarea,
  Add button below the textarea right-aligned like every form dialog) and
  closes itself after the comment is stored — it never shows a thread and never deletes.
  The comment list lives ONLY on the single item page
  (`/todo/[id]`, `/notes/[id]`, `/principles/[id]`): rows with date and four
  actions — copy, pin, edit and a confirmed `×` delete (danger
  `ConfirmDialog`, `aria-label="Delete comment"`) — plus an "Add comment"
  button that opens the same modal. Edit reuses `CommentModal` with the
  existing text prefilled,
  "Edit comment" title and a Save button. The list shows pinned comments
  first, then newest first (`pinned DESC, created_at DESC, id DESC`); a new
  comment is added to the local list and re-sorted without a reload. A pin
  button sits before edit (`Pin` icon, amber and filled when pinned,
  `aria-pressed`, `Pin comment` / `Unpin comment`); several pinned comments
  keep the newest-created first. Copy uses the `Copy` icon and writes the raw
  comment text; on success it swaps to a green `Check` and `Comment copied`
  for 1.5 s, the icon equivalent of the note menu's `Copied`. A missing
  clipboard API shows the standard toast. `PATCH
  /api/{notes,todo/items,principles}/[id]/comments/[commentId]` accepts
  `{ content? }`, `{ pinned? }` or both; edits keep `created_at`, so the
  newest-first order and the comment's position do not change. Comment text
  is `text-xs` (12px), one
  step below the single-item content. A comment longer than one rendered
  line is clamped to one line with an ellipsis; click the comment text to
  expand, click again to contract, exactly like notes. Short comments stay
  plain and non-clickable. The fold uses the note standard's 180 ms
  max-height animation, honors reduced motion, and persists expanded ids in
  `localStorage` (`ferm:expanded-comments`); long comments start collapsed.
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
  star and amber border stay visible while folded. The fold animates over
  180 ms by measuring the full text height: the one-line clamp comes off before
  expansion and returns only after contraction finishes. The clamp lives on an
  inner span inside the text button, not on the button itself: WebKit does not
  reduce a button's layout height for `-webkit-line-clamp`. Reduced motion turns
  the height animation off. Folds persist in
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
  The pill toggles the click-to-load embed below it. On a principle card the
  pill sits at the right edge from `sm` up, matching the tags and comment pill;
  on mobile it stays left.
- **Dark mode**: Settings → General offers `light`, `dark` and `system`; `system`
  follows the OS live. The choice persists as `theme` in `fermentario.config` and
  becomes the `dark` class on `<html>` before first paint. Use Tailwind's native
  `dark:` variant only. Map surfaces `white` → `stone-900`, the page `white` →
  `stone-950`, borders `stone-200` → `stone-800`, headings `stone-900` →
  `stone-100`, and primary fills `stone-900` → `stone-700` (hover `stone-800` →
  `stone-600`) so controls stay visible on dark panels. Heat cells map
  `amber-200/300/400/500` → `amber-900/800/600/500`; empty cells `stone-200` →
  `stone-700`. Keep `text-white` on primary fills.

## Typography

- Scale: `text-[10px]` (metadata, heatmap labels), `text-[11px]` (chips, hints),
  `text-xs` (12px, buttons), `text-sm` (14px, body secondary), `text-[15px]`
  (note content), `text-2xl` (page headings).
- Section headers: `text-xs font-medium uppercase tracking-widest text-stone-400`.
- Day headers in the timeline are the exception: normal case, because they read
  as words ("Today", "Yesterday").
- Single-item content (note, task, principle detail pages) is
  `text-[15px] font-semibold`. Comments stay normal weight so the item reads as
  the page subject, and use `text-xs` (12px) so they sit one step below it.
- Entity detail pages have a `text-2xl` page heading. The type label comes first,
  followed by the short UUID as `text-sm font-normal tabular-nums text-stone-400
  dark:text-stone-500` (for example, **Task #a1b2c3d4**). The full UUID stays in
  the `title` tooltip.
- Month headings in the Done tasks list use the section-header style.

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
| GlobalSearch | `max-w-xl` |

`EditNoteDialog`, `CommentModal` and the edit-principle dialog have a full-screen
toggle in the header (left of Close when present). Expanded, the panel is
`h-dvh max-w-full rounded-none`; its contents sit in a centered `max-w-2xl`
column and the textarea takes the remaining height. `Escape` collapses the panel
before it closes the dialog. The toggle animates height, max-width, corner
radius and backdrop padding over 200 ms; reduced motion turns the animation off.

## Onboarding

- `/welcome` is the first-run screen. It uses no app chrome: a centered
  `max-w-2xl` card with `rounded-3xl`, `p-6 sm:p-8`, and the same stone palette
  as Settings. The primary action creates an empty journal; restore is a
  separate section below a divider so it is never the default click.
- An empty journal contains the schema only. Do not seed notes, tasks,
  principles, tags or a recap: the first screen after creation must be the
  user's empty journal, not a demo.
- `/journal-error` reuses the same card layout. It shows the failure and
  offers retry plus restore. Never redirect a broken or missing active journal
  to `/welcome`: showing a create button there could hide the user's data.
- The welcome and error screens are full-page routes. They do not render the
  composer, the section bar or the header controls.
- The home page has no tagline. The header is only the journal controls and
  settings; do not add a marketing line above the timeline. The view pills run
  **Heatmap**, **Tags**, **Search**; the first two are links, so the notes
  timeline stays on the home page.

## Interaction

- **Destructive actions** (delete note, remove tag, restore database) always go
  through `ConfirmDialog` in `danger` tone.
- **Overlays** are `fixed inset-0 z-50` with a `stone-900/40` backdrop
  (`black/60` in dark mode; the restore overlay is darker) and
  `backdrop-blur-md`, the same blur as the loading state; the backdrop click and
  `Escape` close them, except while a long operation runs. Dialogs with long text (`EditNoteDialog`,
  `CommentModal`, the edit-principle dialog) offer a header toggle that expands
  the panel to the viewport; `Escape` then collapses it first, and the other
  fields and buttons stay fixed while the textarea scrolls.
- **Single note edit** (`/notes/[id]`): Edit replaces the bold note text in the
  same card with a textarea, the optional YouTube URL and a date/time field,
  plus Cancel/Save below. No backdrop and no full-screen toggle. `Escape`
  cancels, `Cmd/Ctrl+Enter` saves. The textarea prefills stored tags as a
  trailing hashtag run, so a text edit does not drop them; deleting a hashtag
  removes that tag. A tag that cannot be written as one hashtag token (a
  multi-word tag from an older note) stays out of the text. The timeline
  `EditNoteDialog` follows the same rule and carries the same date field.
- **Principles** (`PrinciplesTab`): cards show the creation date under the
  text. The Add button carries the same desktop shortcut as the To-Do Add
  button: `⌘⇧A` on Mac, `Ctrl+Shift+A` elsewhere. The hint is hidden on touch,
  and the handler ignores editable targets and open dialogs.
- **Global search** (`GlobalSearch.svelte`) mounts once in the root layout, so
  `Cmd/Ctrl+K` works on every journal route. The home header Search pill (after
  Tags) is the discoverable trigger; it is icon-only on phones. The palette is
  top-anchored (`pt-[max(4rem,12vh)]`, `max-w-xl`), not centered. Results group
  as Notes, To-Do and Principles, up to ten per kind; `library` and `influences`
  are reserved until those sections have data. `↑/↓` select, `Enter` opens,
  `Escape` and the backdrop close. The input placeholder is plain text; the
  `Kbd` chip sits at the right edge of the field.
- **Toasts** come from `$lib/toast.svelte` and render once from the root layout
  (`fixed inset-x-0 bottom-28 z-30`). Use them for final action results only,
  never for progress or background work. Auto-clear: 4 s error, 8 s success.
- **Loading feedback**: a static pill in `app.html` covers hydration no Svelte
  code can see. `NavigationLoader` removes it on mount and takes over: the first
  tracked wait shows at once, later route changes and data waits keep the 120 ms
  anti-flash delay. Both use a glassy full-screen backdrop (`white/25`, or
  `stone-950/25` in dark, plus `backdrop-blur-md`). The backdrop blocks pointer
  input while visible and shows `cursor-wait`; do not let clicks reach the page
  below. Track loads and mutations with
  `loading.track()` from `$lib/loading.svelte`; never track quiet work (tag
  colors, summary refresh, polling, optimistic saves). Keep contextual busy
  states such as the Heatmap button and `RestoreOverlay`; do not add per-route
  spinners.
- **Older engines**: `backdrop-filter` is detected with `@supports` in
  `app.css` (and in the boot-loader block in `app.html`), including the
  `-webkit-` form. Without it, remove the blur and use a more opaque scrim so
  dialog text keeps its contrast. Tailwind already emits an alpha-hex fallback
  before each `color-mix()` background; keep that pattern instead of writing a
  `color-mix()`-only surface.
- **Dictation**: while the microphone is active, the composer button switches
  from `Mic` to a filled `rose-600` stop button with a pulsing ring, and a
  `Listening…` pill with a pulsing dot appears above the bar. Reduced motion
  turns the pulses off. The active state comes from the parent; never assign
  the prop inside the composer.
- **Hover-only controls** must also appear on `focus-visible` so keyboard users
  can reach them.
- **Auto-growing inputs** grow with their content and publish their height so the
  page can reserve space.

## Content rules

- The hour in a timeline row links to the note's single page. Pending notes
  keep a plain hour until the save completes.
- Day headers in the timeline show `Today` / `Yesterday` as English literals and
  older days in the configured language's format (`Intl` output only, no
  hand-written translations).
- The heatmap packs the year backwards, seven per column from 31 December, so
  the newest days sit at the top left and any slack is at the bottom right.
- Below the heatmap, **Done tasks** lists completed tasks across every group and
  year, latest `done_at` first. It groups them under month headings such as
  **October 2026**, with undated completions under **Date unavailable**. It
  loads 50 at a time with a cursor and an `IntersectionObserver` sentinel near
  the bottom; the list is not filtered by the selected heatmap year.
- Ticking a task from open to done asks for confirmation; unmarking a done task
  stays immediate. The confirm button is green: completion is a positive
  change, not a destructive one.
- Tag chips are links to `/tags/<tag>`; when a removal handler is present they
  also carry a hover `×` that asks for confirmation.
- Notes get tags only from hashtags the user types at the end of the note.
  No AI or background pass creates tags.
- `/tags` is the tag cloud index. It counts every tag in `note_tags`,
  `todo_item_tags` and `principle_tags`, never `tag_colors` alone. The most-used
  tags come first; ties are alphabetical. Every pill uses the same size and
  padding, so frequency changes order, not visual weight. Each pill links to
  `/tags/<tag>`, reuses the shared tag palette, and carries an exact count. The
  title gives the per-section breakdown. The cloud has no color picker; open a
  tag to change its color. The home header **Tags** pill opens this page, so the
  timeline keeps its infinite loading. A tag detail's **Back** control uses
  browser history, so it returns to `/tags` when opened there and to the
  previous note when opened from a tag chip. With no history, it falls back to
  `/tags`.
