Status: [DONE]

# Draft survives navigation

## Context
- The composer's text lives in `+page.svelte` state (`text`, `question`). Any client-side navigation — the Heatmap link, a tag chip, the back links — unmounts the whole page and drops that state, so returning shows an empty composer. The Models/Config modals are fine because they do not navigate.
- The user reported losing a half-written note when clicking the Heatmap icon or another icon.

## Requirements
1. Unsaved composer text survives SPA navigation and a full page reload.
2. Both inputs are covered: the note box and the Ask box.
3. The draft is cleared when the note or the question is actually saved.
4. No schema, API or composer change.

## Acceptance criteria
- Typing part of a note, clicking Heatmap, and coming back restores the text.
- The same works for a tag chip and for the Ask input.
- Saving a note or sending a question clears the draft, so it does not reappear.
- `pnpm run check` prints 0 errors and 0 warnings.

## Progress

### 2026-09-24 — done
- New `src/lib/draft.ts`: `loadDraft`, `saveDraft`, `clearDraft` over `sessionStorage` under `fermentario.draft`, storing `{ note, ask }`. `sessionStorage` is per tab, so it survives SPA navigation and a reload, and dies with the tab.
- `+page.svelte`: the mount effect restores `text` and `question` from `loadDraft()`; `onTextIm` and `onQuestionIm` call `saveDraft` on every keystroke; `handleNote` and `handleAsk` call `clearDraft()` after a successful save.
- The composer is untouched: it already sends every keystroke up through `onText` / `onQuestion`, and the tag pages and heatmap never read the draft.
- Verified: `pnpm run check` 0/0, `build` clean, `GET /`, `/heatmap`, `/tags/garden`, `/api/notes` 200, and `fermentario.draft` present in the built client chunk.
- The behaviour itself needs the user's browser: type part of a note, click Heatmap, come back, text is there; same for a tag chip and the Ask input; a saved note does not come back as a draft.
