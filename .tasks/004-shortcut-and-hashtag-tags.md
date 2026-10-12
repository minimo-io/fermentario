Status: [DONE]

# Universal tab shortcuts + hashtag tags

## Context
- Task 003 shipped a `G` then `N` / `G` then `A` sequence with kbd hints in the Notes/Ask pills. The user asked for Ctrl on Windows/Linux and Command on macOS instead.
- Plain `Ctrl`/`Cmd` + 1…8 cannot work: Chrome, Firefox and Safari bind it to "jump to a specific tab", so the browser never delivers the key to the page. Every single letter is also bound (select all, bookmarks, address bar, new tab, and so on). `Ctrl`/`Cmd` + `Shift` + 1/2 is unbound in all three browsers on all three platforms, so it is the universal choice.
- Notes can already carry tags (task 001: note_tags table, chips in Timeline, model auto-tagging). Task 002 added PATCH /api/notes/[id] and clears tags on edit.

## Requirements
1. `Ctrl`/`Cmd` + `Shift` + `1` selects Notes; `+ 2` selects Ask. Guard: platform primary modifier, `!altKey` (Windows AltGr reports Ctrl+Alt), not an editable target, `!isComposing`, no modal open. The `G` sequence state is removed.
2. Pills show the combo as kbd caps: `⌘ ⇧ 1` on Apple, `Ctrl ⇧ 1` elsewhere, with matching `aria-keyshortcuts`.
3. A trailing run of `#hashtags` at the end of a note is removed from the stored content and stored as that note's tags. Lowercase, dedupe, max 8, `#` must follow whitespace or start the content, so mid-sentence hashtags, URL fragments and markdown headings are untouched.
4. A note with hashtags is never passed to the model: the user's tags are the tags. Notes without hashtags keep the current best-effort model tagging.
5. Editing a note follows the same rule: hashtags present replace the tags and skip the model; none present clears the tags and runs the model as today.
6. The composer shows the tags that will be saved as ghost chips above the Notes input.

## Acceptance criteria
- Ctrl+Shift+1 / Cmd+Shift+1 (and 2) switch views; typing with a modifier never does.
- A note ending in `#sleep #running` is stored without that text and shows both chips.
- `#running` mid-sentence, `url.com/#anchor` and `# Heading` are not treated as tags.
- A note that is only hashtags is rejected with 400.
- Editing a tagged note replaces its tags from the new text.
- `pnpm run check` prints 0 errors and 0 warnings.

## Progress

### 2026-09-23 — started
Plan agreed: Ctrl/Cmd+Shift+1/2 for the tabs, trailing hashtags stripped into tags, model skipped when the user supplied tags.

### 2026-09-23 — done
- `handleViewShortcut(e)` replaces the `G` sequence; `gPending`, `gTimer` and `clearG()` deleted. Requires `shiftKey`, the platform primary modifier (`metaKey` on Apple, `ctrlKey` elsewhere), `!altKey` (Windows AltGr reports Ctrl+Alt), a non-editable target, `!isComposing`, and no open modal.
- New src/lib/platform.ts `isAppleDevice()`: `navigator.userAgentData.platform`, falling back to `navigator.platform` then the UA string; false during SSR. Set in `onMount`, so SSR emits the Control variant and the pill flips to `⌘ ⇧ 1` on Mac after hydration without a mismatch. `aria-keyshortcuts` = `Meta+Shift+1` / `Control+Shift+1`.
- New src/lib/hashtags.ts `splitTrailingHashtags()`: walks backwards from the end of the text, so a hashtag must be the last token. `(?:\s|^)` before `#` keeps URL fragments and mid-sentence hashtags out; `[\p{L}\p{N}][\p{L}\p{N}_-]{0,29}` after `#` excludes markdown headings. Max 8 tags, lowercase, dedupe, order preserved via unshift.
- POST /api/notes parses first, stores the stripped text, saves the tags, and never calls the model for a note the user tagged. Hashtags-only and empty both give 400.
- PATCH /api/notes/[id] follows the same rule and also sets `note.tags = []` after the clear — otherwise the response returned the pre-clear array read by `updateNote()` (found by live test 8).
- Composer shows pending tags as dashed ghost chips above the Notes input, from the same shared parser, so the stripped text is visible before saving.
- Verified live on throwaway notes: trailing hashtags stripped and tagged; mid-sentence, URL fragment, markdown heading untouched; hashtags-only 400; edit replaces tags; edit without hashtags clears them in DB and response; FTS holds the new text and not the tag words; delete leaves no orphan rows. All test notes removed; the user's two notes untouched. `pnpm run check` 0/0, `pnpm run build` clean, `GET /` and `GET /api/notes` 200.
