Status: [DONE]

# Influences section (later version)

## Context
- The Influences section is deferred to a later version. This task reserves its place in the section order so the shell (task 023) and any ordering work account for it.
- Do not design or implement Influences here. When the version comes, replace this file's scope with the real Context, Requirements, and Acceptance criteria.

## Requirements
1. The Influences pill exists in the section bar and renders the standard empty-section placeholder.
2. No route logic, no tables, no UI beyond the placeholder.

## Acceptance criteria
- Opening Influences shows the placeholder and never 404s.
- `pnpm run check` 0/0, `pnpm test` 28/28.

## Progress

### 2026-10-12 — done
- Placeholder delivered by task 023's `SectionPlaceholder`: the Influences pill renders it, never 404s. Real scope deferred to a later version.