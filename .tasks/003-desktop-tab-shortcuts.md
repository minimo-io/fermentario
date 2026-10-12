Status: [DONE]

# Desktop tab shortcuts

## Context
- The Notes/Ask pills in src/routes/+page.svelte are click-only. The app is a voice journal used on desktop with a mouse and keyboard.
- No keyboard shortcut infrastructure exists. The only global key handler is the top-level `<svelte:window onkeydown>` in +page.svelte (Escape closes the Models/Config modals).
- Entries can be long, so a bare letter shortcut would steal typing. A two-key sequence (G then N / G then A) is safe and matches the vim-style muscle memory most people have.

## Requirements
1. `G` then `N` selects the Notes view; `G` then `A` selects the Ask view. The pending `G` expires after 800 ms.
2. Ignore the shortcut when the event target is an INPUT, TEXTAREA, SELECT, or contenteditable element; when `metaKey`, `ctrlKey`, or `altKey` is held; when `isComposing` is true (the app supports es/pt input); and while the Models or Config modal is open.
3. Each pill shows its own shortcut as a `<kbd>` hint, hidden below the `sm` breakpoint. The hint inverts on the active (dark) pill.
4. Pills expose `aria-keyshortcuts` and the group uses `role="tablist"` / `role="tab"` / `aria-selected`.

## Acceptance criteria
- G, N switches to Notes and G, A switches to Ask from anywhere in the page body.
- Typing "g" or "n" in the note or Ask input never switches the view.
- Holding Cmd/Ctrl/Alt with the sequence does nothing.
- The kbd hints are visible at desktop width and hidden on a phone-sized screen.
- `pnpm run check` prints 0 errors and 0 warnings.

## Progress

### 2026-09-23 — started
User chose the vim-style sequence and the `sm` breakpoint for the hints. Implementation: Kbd.svelte, shortcut handler on the existing `<svelte:window>`, pill hints.

### 2026-09-23 — done
- New src/lib/components/Kbd.svelte: `keys: string[]` + `tone: 'light' | 'dark'`, `hidden items-center gap-0.5 sm:inline-flex`, `aria-hidden` (the button's `aria-keyshortcuts` carries the meaning for screen readers). Dark tone inverts on the active pill.
- +page.svelte: `handleTabShortcut(e)` with `clearG()` and an 800 ms `gTimer`. Guards: meta/ctrl/alt, `isComposing`, editable targets (INPUT/TEXTAREA/SELECT/contenteditable), and open Models/Config modals. The pending `G` is cleared by any second key, by the timer, or by the next `G`.
- Wired into the existing top-level `<svelte:window onkeydown>` alongside the Escape logic. Timeline-owned overlays need no coordination: switching views unmounts Timeline and closes them.
- Pills now have `role="tablist"`/`role="tab"`/`aria-selected` and `aria-keyshortcuts="G N"` / `"G A"`.
- Verified: `pnpm run check` 0/0, `pnpm run build` clean, `GET /` 200, and the SSR output contains both pills' `aria-keyshortcuts` and both `<kbd>` hints (dark tone on the active pill, light on the other). The key sequence itself needs a desktop check.
