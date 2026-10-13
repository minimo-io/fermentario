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

## Spacing

A `0.5rem` rhythm. The values already in use:

| Token | Value | Used for |
|---|---|---|
| `gap-1` | 0.25rem | chips, tight rows |
| `gap-2` | 0.5rem | buttons, list items |
| `gap-3` | 0.75rem | card internals |
| `mt-2` / `mb-2` | 0.5rem | chip rows, small separators |
| `mb-4` | 1rem | day sections, card groups |
| `pt-14` | 3.5rem | page top, clears the fixed header zone |
| `pb-24` | 6rem | page bottom |
| `px-6` | 1.5rem | horizontal page and composer padding |

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
