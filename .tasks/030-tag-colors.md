Status: [DONE]

# Tag colors

## Context
- Tags are plain strings in `note_tags`; there is nowhere to hang a color. A tag registry table (one row per normalized tag) owns the color, so renames and reuse keep it.
- Default is a subtle gray so uncolored tags read exactly as today. Color is an accent on chips, never a new text color that breaks the `stone` scale in `docs/DESIGN.md`.

## Requirements
1. A tag registry with one color per normalized tag, default subtle gray.
2. The user sets a tag's color from a chip (timeline, tag page, or To-Do item). One change recolors every chip with that tag.
3. To-Do item tags (task 024) share the registry and the colors.
4. Deleting the last note/item with a tag keeps the registry row (color choice survives); no orphan cleanup deletes user choices.

## Acceptance criteria
- Setting a color recolors the tag everywhere, verified across timeline, tag page, and To-Do.
- Fresh tags render gray; the gray matches the existing chip style.
- `pnpm run check` 0/0, `pnpm run build` + `build/index.js`, `pnpm test` 28/28, `GET /` 200.

## Progress

### 2026-10-12 — done
- `tag_colors` registry table + `listTagColors`/`setTagColor`. Palette keys only (no free CSS); default gray reads as before. Routes `GET /api/tags`, `PUT /api/tags/[tag]` (400 on unknown color).
- `TagChip.svelte` replaces both Timeline chip variants and the To-Do chips; dot button opens a swatch popover, shared `tagColors` store recolors everywhere at once. Registry loads on main/tag/todo mounts; SSR stays gray.
- Verified live: set amber, bad color 400, map round-trip. Gates: check 0/0, build + `build/index.js`, test 28/28, `GET /` 200.