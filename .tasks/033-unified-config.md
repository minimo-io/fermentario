Status: [DONE]

# Unified config button and tabbed modal

## Context
- Config is scattered: Models and Config buttons in the top bar, backup/restore inside other surfaces. One always-visible bottom-left button (Material-style FAB) opens one tabbed modal holding every app config.
- Tabs: Language (as now), Models (selector, Re-brew, download states as now), Database (export download, import with confirm + progress, as now). Behavior moves, it does not change.

## Requirements
1. A bottom-left FAB, visible in every section, opening a tabbed modal (Language | Models | Database).
2. Language tab keeps `modelLang`/`entriesLang` behavior. Models tab keeps selector, readiness gating, and Re-brew semantics. Database tab keeps checkpoint-then-download export and the confirm + phased-stream import.
3. The top-bar Models and Config buttons retire. Nothing else in the header changes.
4. `saveConfig` keeps merging partials so tab switches never wipe each other's choices.

## Acceptance criteria
- Every current config action is reachable in the modal and behaves identically (language switch, model switch + Re-brew gating, export integrity, import phases + toast counts).
- The FAB is reachable by keyboard and screen reader (labeled button, `Escape` closes, backdrop click closes except mid-import).
- `pnpm run check` 0/0, `pnpm run build` + `build/index.js`, `pnpm test` 28/28, `GET /` 200.

## Progress

### 2026-10-12 — done
- `SettingsModal.svelte` (Language | Models | Database tabs) composing new `LanguagePanel`, `ModelsPanel` (moved verbatim from the old modal), `DatabasePanel` (export/restore/diagnostics moved verbatim). Deleted `ModelsModal.svelte` + `ConfigModal.svelte`.
- Bottom-left gear FAB above the composer; top-bar Models/Config buttons retired; `Escape` closes. `saveConfig` still merges partials across tabs.
- Gates: check 0/0, build + `build/index.js`, test 31/31, `GET /` 200, FAB in SSR, old buttons absent.

### Follow-up — buttons to the top right + safe area
- Both bottom FABs removed. The header row now ends with a small Ask pill left of a gear icon button (`ml-auto` group). Container top padding is `max(3.5rem, env(safe-area-inset-top))` and `src/app.html` carries `viewport-fit=cover` so installed PWAs clear the notch. Verified in SSR: one Settings button, one Ask pill, zero bottom FABs. Gates re-run green.

### Follow-up — configurable column width + modal motion
- `contentWidth` (`narrow|standard|wide`, default `standard`) in `fermentario.config`, `src/lib/display.ts` owns sanitize + class map. Every page container and the composer bar follow it; control lives in the Language tab; `docs/DESIGN.md` documents the three widths.
- Settings tab switches animate container height (measured pixels + CSS transition, `motion-reduce` off-ramp); section rows glide with `animate:flip`. Gates re-run green: check 0/0, build + `build/index.js`, test 31/31, `GET /` 200; default width unchanged in SSR.