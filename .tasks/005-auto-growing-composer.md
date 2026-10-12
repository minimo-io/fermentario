Status: [DONE]

# Auto-growing composer

## Context
- The composer uses a single-line `<input>` in both views (Composer.svelte), so a long note or question scrolls sideways inside a one-line box and the user cannot see what they are writing.
- The composer is `fixed bottom-0`, and the page reserves room for it with a static `pb-44` on the main container. A taller bar would cover the last timeline entries and the dashed hashtag chips.
- The input is already a controlled component (`value` + `oninput` + callback), so the value can be changed from the parent by voice input or by clearing it.

## Requirements
1. Both composer inputs (Notes and Ask) become wrapping textareas: `rows="1"`, no manual resize handle, `max-h-[45dvh]`, scrolling inside once the cap is reached, and an `aria-label`.
2. The box grows with the content so the whole message stays visible, in JavaScript rather than CSS `field-sizing`, because Firefox support is not guaranteed.
3. The height must follow every value change, including voice input that arrives through the parent prop, clearing the input, and switching between the two views.
4. Enter keeps its current meaning: Enter saves the note or sends the question, Shift+Enter inserts a line break.
5. The page reserves space dynamically: a ResizeObserver on the composer root publishes its height as `--composer-h`, and the main container derives its bottom padding from it, so the last note is never covered.

## Acceptance criteria
- Typing a long note or question wraps to more lines and the composer grows upward.
- Voice input, clearing, and view switching all resize the box.
- The box stops growing at 45dvh and scrolls internally beyond that.
- The last timeline entry stays visible at any composer height.
- `pnpm run check` prints 0 errors and 0 warnings.

## Progress

### 2026-09-23 — started
Plan agreed: JS auto-grow in Composer for both views, Enter saves / Shift+Enter newline, dynamic page padding through a CSS variable.

### 2026-09-23 — done
- Both composer inputs are now textareas: `rows="1"`, `resize-none`, `max-h-[45dvh]`, `overflow-y-auto`, shared `FIELD_CLASS`, plus `aria-label` "Note" / "Question". The bar uses `items-end` so the mic and Save/Ask buttons sit at the bottom next to a tall box.
- `autosize()` sets `height: auto` then `height = scrollHeight`. It runs from `oninput` and from two `$effect`s: one tracking `text` / `question` (voice input, clearing) and one tracking `view` / `field` (tab switch remounts the element). Reading `field` inside `autosize` also makes the effect depend on it, so the new element is always measured after a tab switch.
- Enter still saves the note and Enter still sends the question; `!e.shiftKey` makes Shift+Enter insert a line break.
- A `ResizeObserver` on the bar root writes `--composer-h` to `:root`, and the main container changed from `pb-44` to `pb-[calc(var(--composer-h,4.5rem)+2.5rem)]`. The 4.5rem fallback covers the first paint before the observer fires. The observer also covers the dashed hashtag chips, which change the bar height without any input.
- Why JS and not CSS `field-sizing: content`: Firefox support is not guaranteed, and the JS version also has to react to parent-driven value changes (voice input) anyway.
- Verified: `pnpm run check` 0/0, `pnpm run build` clean, `GET /` 200, SSR output contains the Note textarea with its classes, and the built CSS contains `padding-bottom: calc(var(--composer-h, 4.5rem) + 2.5rem)`. Typing behaviour needs a real browser check.
