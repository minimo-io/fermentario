Status: [DONE]

# Layout consistency

## Context
- The heatmap used `max-w-5xl` (1024px) while the homepage, tag pages, composer and Ask thread used `max-w-2xl` (672px). The user asked for one max width across all pages, plus a design principles document.
- I first standardised on 1024px, widening the homepage and leaving the composer at 672px. The user rejected that: the standard must be the homepage's original 672px, and the composer must match the page.

## Requirements
1. Every page uses the same max width: `max-w-2xl` (672px), the homepage's original measure.
2. The heatmap, whose 53-column grid needs about 800px, scrolls horizontally inside its container instead of widening the page.
3. The composer keeps `max-w-2xl`, so the bar and the content align with no gap.
4. A `docs/DESIGN.md` documents the system, and `AGENTS.md` points at it.

## Acceptance criteria
- `/`, `/heatmap` and `/tags/<tag>` all render `mx-auto max-w-2xl`.
- The composer renders `mx-auto max-w-2xl`.
- `docs/DESIGN.md` exists and is referenced from `AGENTS.md`.
- `pnpm run check` prints 0 errors and 0 warnings.

## Progress

### 2026-09-24 — done
- `+page.svelte` and `tags/[tag]/+page.svelte` are back at `max-w-2xl`; `heatmap/+page.svelte` moved from `max-w-5xl` to `max-w-2xl`, so its grid scrolls inside the existing `overflow-x-auto` wrapper. The composer was already `max-w-2xl` and needed no change.
- New `docs/DESIGN.md`: layout (page container, composer, bottom clearance via `--composer-h`, the single `sm:` breakpoint), the 0.5rem spacing table, the stone/amber/rose/emerald color rules, the typography scale, the component width table (confirm `max-w-xs`, actions/config/restore `max-w-sm`, edit note `max-w-md`, copy fallback `max-w-lg`, models `w-[min(92vw,30rem)]`), interaction rules (confirm gate for destructive actions, overlay z-index, toast placement, focus-visible for hover-only controls) and the content rules (relative day labels, heatmap packing, tag chips).
- `AGENTS.md` Process section gained: "Layout and design decisions live in `docs/DESIGN.md`. Consult it before changing page widths, spacing, colors, typography or component sizes."
- Verified: `pnpm run check` 0/0, `build` clean, `GET /`, `/heatmap`, `/tags/garden`, `/api/notes` 200, and all three pages render `mx-auto max-w-2xl` in the SSR output.
- Mistake made and corrected: I first widened the homepage to the heatmap's 1024px and left the composer at 672px, which made the bar narrower than the page. The user rejected it; the standard is now the homepage's original 672px everywhere, with the heatmap scrolling internally.
