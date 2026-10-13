Status: [DONE]

# Fullscreen note editor

## Context
- Long notes outgrow the composer bar. Like OpenCode's editor, a toggle opens the note text in a full-screen textarea; closing returns to the bar with the text intact.
- The composer inputs are controlled (`value` + `oninput` + callback, never `bind:` on a plain prop). The fullscreen editor must be the same controlled input, not a second source of truth, or edits diverge.

## Requirements
1. A toggle on the composer opens a full-screen overlay textarea with the current note text.
2. Typing, voice input, draft persistence (`sessionStorage`), and trailing-hashtag parsing behave identically in both sizes.
3. Save from the overlay saves and closes; `Escape`/close returns without saving but keeps the text.
4. Follows `docs/DESIGN.md` (overlay pattern, spacing, type scale).

## Acceptance criteria
- Text typed in either size appears in the other with no loss, including across save and across `Escape`.
- Voice dictation and draft restore work in fullscreen exactly as in the bar.
- `pnpm run check` 0/0, `pnpm run build` + `build/index.js`, `pnpm test` 28/28, `GET /` 200.

## Progress

### 2026-10-12 — done
- `Composer.svelte`: expand button in both views opens a fullscreen overlay bound to the same controlled `text`/`question` + callbacks (no second source of truth). Save/Ask + autofocus + caret end, `Escape` closes, `Cmd/Ctrl+Enter` submits, hashtag chips preview. A11y `tabindex="-1"` on the dialog (check requires it).
- Gates: check 0/0, build + `build/index.js`, test 28/28, `GET /` 200, expand button in SSR. Overlay interaction needs a real browser click.

### Follow-up — overlay respects width + fades
- The overlay header, chips, and editor now use the `widthClass` prop (your Column width) instead of hardcoded `max-w-2xl`. Open/close runs a 150ms `fade`. Gates re-run green.