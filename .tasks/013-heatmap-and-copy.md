Status: [DONE]

# Heatmap + copy loaded notes

## Context
- The only clipboard code was per note (`NoteActionsMenu.svelte`), and `navigator.clipboard` does not exist on the plain-HTTP tailnet origin the user actually uses (`http://100.77.206.41:4173/`), so copy silently fails there.
- The user asked for copying whole weeks/months, then settled on copying everything the timeline has loaded plus a GitHub-style heatmap of note counts per day, grouped by month, all time and horizontally scrollable, with the day's count on hover or tap.
- The "week" question was answered by the heatmap layout, so the grid defines the week structure: Monday-first ISO weeks (one constant).

## Requirements
1. A Copy button above the timeline that puts every loaded note on the clipboard, labelled with the number of notes it will copy (loaded notes, not the server total).
2. Copy output is plain text grouped by day, chronological within a day, with tags appended, because task 004 strips hashtags out of the note text.
3. When the clipboard API is unavailable, a dialog shows the text pre-selected with a Download .txt escape hatch.
4. A Heatmap screen: all time, grouped by month, one square per day, colour intensity from the count, and the count on hover or tap.
5. No per-week or per-month copy actions, no date-range picker, no day-to-timeline navigation.

## Acceptance criteria
- The copy label always matches the number of notes that will be copied.
- The copied text has one day header per day, oldest first, with tags on their note.
- A restore-insecure origin shows the fallback dialog instead of failing silently.
- The heatmap square count equals the note count per day from SQLite, and the total matches the note count.
- `pnpm run check` prints 0 errors and 0 warnings.

## Progress

### 2026-09-24 — done
- `src/lib/note-export.ts`: `groupNotesByDay()` (day keys use the same `en-CA` format as Timeline) and `formatNotesForClipboard(notes, locale)` → `Weekday, D Month YYYY` header then `HH:MM  text  #tag` lines, days ascending, notes ascending inside a day. Verified in isolation with tsx: header shape, ordering, tags appended, multi-line content preserved, empty input returns `''`.
- `CopyFallback.svelte`: readonly textarea, pre-selected on mount, `document.execCommand('copy')` attempt plus a Download .txt button built from a Blob. Needed because `navigator.clipboard` is undefined on plain HTTP.
- Main page: a row above the Timeline with `N notes loaded` and a Copy button (Copy icon, "Copied" flash for 1.5 s). `copyLoadedNotes()` tries the clipboard and falls back to the dialog. Locale follows `config.entriesLang`.
- `GET /api/stats/heatmap`: one query, `date(created_at/1000,'unixepoch','localtime')` grouped and counted, plus the total. Verified against SQL per day and total.
- `/heatmap` route (+page.ts load, +page.svelte): back link, totals with the busiest day, month sections with labels and per-month counts, 7-row calendar grid per month with leading/trailing blanks, five-step amber scale relative to the max day, legend, and a tooltip on hover that a click/tap pins. Cells are `<button tabindex="-1">` with `aria-label` so the a11y rules pass without creating a thousand-tab-stop grid.
- Header: a Heatmap pill (`grid-3x3` icon) next to Models and Config.
- Verified: `check` 0/0, `build` clean, `GET /`, `/heatmap`, `/api/stats/heatmap`, `/api/notes` all 200; SSR shows the amber shades, the month label and the busiest day; the main page shows the `/heatmap` link and the `N notes loaded` row.
- Re-hit the WAL visibility trap a third time while cross-checking (a fresh SQLite connection showed pre-checkpoint counts). The rule stands: verify through the app's API or checkpoint first, and never conclude a write was lost from a direct file read.
- Browser pass needed from the user: hover tooltip, tap on mobile, and the copy fallback over the tailnet URL.

### 2026-09-24 — revised: GitHub-style year grid
- Month blocks were wrong. `/heatmap` is now one continuous grid for one year: columns are ISO weeks (Monday-first), rows the seven weekdays, spanning the Monday on/before 1 January to the Sunday on/after 31 December (52-53 columns, verified for 2024 leap, 2025 and 2026). Columns run ascending, January first, today at the far right.
- A parallel label array with the same `w-3` + 3px gap aligns one month name per month above the grid; `Mon Wed Fri` labels sit on the left edge like GitHub. Days after today get an outline-only style so the year reads as complete without implying "zero notes in the past" (98 such cells in 2026), and the legend shows that swatch as "not yet".
- Year selector: pills for the years that have notes plus the current year, choice kept in `localStorage` under `fermentario.heatmapYear`. The summary line follows the selected year and still shows the all-time total.
- Fixed while verifying: the month name repeated on every column (one label per month requires tracking the last labelled month; the first column of January, February, ... does not change until the next month). Caught by reading the SSR label sequence, which now reads `Jan Feb Mar … Dec` once each.
- The copy button label is now "Copy all" because it copies every LOADED note, not the visible viewport. The adjacent `N notes loaded` label carries the exact count. The per-note "Copy to clipboard" in NoteActionsMenu is a different action and keeps its wording.
- Verified: `check` 0/0, `build` clean, `GET /`, `/heatmap`, `/api/stats/heatmap`, `/api/notes` 200; grid logic checked in isolation for 2024/2025/2026 (all days present, start on a Monday, end on a Sunday, 12 labels); "Copy all" present in the built client.

### 2026-09-24 — revised: flush rectangle
- The user wanted one complete rectangle with the slack at the end, not a calendar-aligned grid. Replaced the ISO-week builder with sequential packing: the year's days in order, seven per column, starting flush at row 0 of column 1 with 1 January. Verified for 2024 (366 days), 2025 and 2026: 53 columns, first cell 1 Jan at row 0, last cell 31 Dec, every column full except the 53rd, 12 month labels.
- Removed the `Mon Wed Fri` row labels and `FIRST_WEEKDAY`, because rows no longer mean a weekday and the labels would be wrong. A year is not a multiple of seven (365 = 52×7+1, 366 = 52×7+2), so the final column is short and the slack sits at the bottom right — the only alternative is the December padding at the top left that the user rejected.
- "Not yet" days now render as a visible fill (`bg-stone-100` + inset ring) instead of a near-invisible bare ring, which was the other reason the block looked broken: 98 of them used to vanish against the page. Legend updated.
- Verified in SSR: month labels read `Jan … Dec` once each, 54 `grid-rows-7` containers (53 columns + the legend swatch), 98 not-yet cells, 265 empty past cells, 2 amber cells (the 3 notes fall on 2 days), summing to exactly 365 in-grid cells, no bare-ring cells left, no weekday labels.
- `pnpm run check` 0/0, `build` clean, `GET /`, `/heatmap`, `/api/stats/heatmap` 200.

### 2026-09-24 — revised: one style for every empty day
- The user rejected the split neutrals. `shade()` now returns `bg-stone-200` for every day with `count === 0`, past or still ahead, so the grid is one uniform block and only days with notes carry amber. The `future` flag is kept but used only for the tooltip, which says "Sat 5 Sep — not yet" instead of "0 notes".
- Removed the "not yet" swatch and label from the legend; it is now `less` → `stone-200` → `amber-200…500` → `more`.
- Verified in SSR: 363 cells with `bg-stone-200`, 2 amber cells, zero `stone-100`+ring cells, zero "not yet" text in the legend, 365 total cells.
- Consequence to remember: nothing marks where today is. If that is wanted later, one subtle ring on today's square would show it without breaking the uniform look.
- `pnpm run check` 0/0, `build` clean, `GET /`, `/heatmap`, `/api/stats/heatmap` 200.

### 2026-09-24 — revised: mark today
- Today's square is marked with a 1px ring (`ring-1 ring-stone-900/50`) instead of a second fill colour, which keeps the one-neutral-style rule intact. The ring is applied by comparing `cell.key` with `todayKey`, so a past year simply has no marker and needs no extra condition.
- The legend gained a "today" swatch with the same ring, the `aria-label` of the cell ends with "(today)", and its tooltip ends with "· today" so sighted and screen-reader users get the same information.
- The user judged the full-strength `ring-stone-900` too aggressive; it is now `ring-stone-900/50` on both the cell and the legend swatch. `/50` is the right lever here: keep the hue, drop the opacity, rather than adding a second neutral fill.
- Verified in SSR: exactly 2 occurrences of the ring class (one cell, one legend swatch), the marked cell's label reads "Thursday, September 24, 2026: 1 note (today)", and the cell count is unchanged at 365.
- `pnpm run check` 0/0, `build` clean, `GET /`, `/heatmap`, `/api/stats/heatmap` 200.

### 2026-09-24 — timeline day headers follow the configured language (format only)
- Day headers no longer print the ISO key. `Today` / `Yesterday` are English literals in every language; older days use the locale's own format through `Intl`, with no hand-written translations (the user was explicit about this: format only).
- New `src/lib/dates.ts` `dayLocale(lang)`: `en -> en-GB`, `es -> es-ES`, `pt -> pt-PT`. The `{#each}` key stays the ISO day, so switching language re-renders labels without regrouping, and `todayKey` / `yesterdayKey` are built in the same ISO format so month and year boundaries need no special cases.
- A 60 s tick keeps `Today` / `Yesterday` honest when the app is left open across midnight, without regrouping the notes.
- The `<h2>` lost `uppercase` so it reads "Today"; its `title` is the locale's long form, so every label reveals the exact day on hover. The note hour and the "edited" tooltip now use the same locale instead of hardcoded `en-GB`; the Ask thread timestamp still follows the browser locale and was left alone.
- Verified in isolation for en/es/pt: labels are `Today · Yesterday · 22 Sept 2026` (en-GB), `Today · Yesterday · 22 sept 2026` (es-ES), `Today · Yesterday · 22/09/2026` (pt-PT), with long titles per locale. Correction to the plan: pt-PT's short format is numeric (`22/09/2026`), not `22 set 2026` as I predicted.
- The headers are client-rendered, so they cannot be verified with curl; the built chunk contains both labels. `pnpm run check` 0/0, `build` clean, `GET /`, `/tags/garden`, `/heatmap`, `/api/notes` 200.
