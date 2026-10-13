Status: [DONE]

# Sections shell and reorder

## Context
- The app grows beyond Notes and Ask: the main sections are Notes, To-Do, Library, Principles, and Influences, plus config. The current view switch is a two-pill tab row in `src/routes/+page.svelte` that does not scale to five sections and stacks poorly on mobile.
- Ask leaves the tab bar in this task and becomes a global always-present bottom-right button (Material-style FAB). The section bar owns navigation only.
- Order is user data: the user reorders sections by drag-and-drop and from the config. Persist the order in `fermentario.config` in localStorage, like the existing language and model choices.

## Requirements
1. A section bar with one pill per section (Notes, To-Do, Library, Principles, Influences) that replaces the current Notes/Ask tabs as the single view switcher.
2. On mobile the bar is a touch-native horizontal carousel (`overflow-x-auto` with `scroll-snap`), never stacked or wrapped. Desktop keeps the pill row. Only the existing `sm:` breakpoint is used.
3. Reorder by drag-and-drop on desktop and mobile, and by an order list in the config. The order persists across reloads.
4. Ask becomes a bottom-right FAB visible in every section. It opens the Ask view wherever the user is.
5. Sections with no implementation yet (Library, Influences) render a placeholder, not a 404.

## Acceptance criteria
- Five pills render on desktop; on a 360px viewport they scroll horizontally with snap and never wrap.
- Dragging a pill (mouse and touch) plus the config order list both change the persisted order, verified across a reload.
- The Ask FAB is present in every section and opens Ask without losing the current section.
- `pnpm run check` 0/0, `pnpm run build` + `build/index.js`, `pnpm test` 28/28, `GET /` 200.

## Progress

### 2026-10-12 — done
- `src/lib/sections.ts` registry + `sanitizeSectionOrder`; order persists in `fermentario.config.sections`. `SectionBar.svelte`: pill carousel (`snap-x`, mobile scroll, `sm:flex-wrap`), pointer drag (mouse immediate, touch 280ms hold so pans still scroll), click-suppression after reorder. `SectionPlaceholder.svelte` for unbuilt sections.
- `+page.svelte`: `view: View`, `lastSection`, `composerView` (Composer keeps its `notes|ask` prop), digits 1–5 follow the persisted order, Ask is a bottom-right FAB (`toggleAsk`), Config modal holds an up/down order list applying immediately.
- Gates: check 0/0, build + `build/index.js`, test 28/28, `GET /` 200. SSR shows all 5 pills in default order plus the Ask FAB. Touch-drag needs a real device to feel.

### Follow-up — section pill icons
- Each pill renders its lucide icon (`notebook-pen`, `list-todo`, `library-big`, `scale`, `lightbulb`) via the `Section.icon` registry field, `h-3.5 w-3.5`, `aria-hidden`. SSR shows 5 pills / 5 SVGs. Note: `{@const}` cannot sit inside `<button>` — member-expression `<s.icon />` is the form that compiles. Gates re-run green: check 0/0, build + `build/index.js`, test 31/31, `GET /` 200.