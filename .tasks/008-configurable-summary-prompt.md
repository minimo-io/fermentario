Status: [DONE]

# Configurable summary prompt

## Context
- The weekly-summary prompt is hardcoded in src/routes/api/summary/+server.ts (system: "You write short summaries of private journal notes."; fixed user instruction). The week's notes and the language directive are appended below it. The summary is triggered client-side by refreshSummaryAnswer() in src/routes/+page.svelte using query params lang/model.
- ModelsModal.svelte holds model selection, status, and Re-brew. Config persists in localStorage `fermentario.config` (chatModel, modelLang, entriesLang) via saveConfig() merge.

## Requirements
1. Add config field `summaryPrompt: string` to LangConfig in +page.svelte (default `''` = use built-in prompt). Extend the localStorage load/validation to accept it.
2. ModelsModal: add a "Summary prompt" textarea and a "Reset to default" button. New props `prompt` and `onPromptChange`, wired to `saveConfig({ summaryPrompt })`. Helper text states the week's notes are appended below the prompt as input, as today.
3. refreshSummaryAnswer(): append `&prompt=` + encodeURIComponent when summaryPrompt is non-empty.
4. api/summary: read `?prompt=`. When present, use it as the base instruction in place of the fixed user text; still append notesText and LANG_DIRECTIVE below, in the same order. System message stays fixed. Sparse-week gate unchanged (custom prompt does not apply to sparse weeks).
5. clean()/REFUSAL handling unchanged.

## Acceptance criteria
- Editing the prompt and running Re-brew produces a summary from the new prompt, with notes and language directive still appended.
- Empty prompt → built-in behavior unchanged.
- Prompt persists per browser across reloads with the rest of the config.
- `pnpm run check` prints 0 errors and 0 warnings.

## Progress

### 2026-09-23 — started
Picked up after task 009. Reading the summary route, ModelsModal and the config load/validation before changing anything.

### 2026-09-23 — done
- `LangConfig` gained `summaryPrompt: string` (default `''`), and the localStorage load validates it as a string, so a config saved before this change still loads.
- ModelsModal: new `prompt` / `onPromptChange` props with a 3-row textarea (bounded at `max-h-40`), the built-in prompt as placeholder, helper text saying the week's notes and the language instruction are appended below, and a "Reset to default" button that clears it.
- `refreshSummaryAnswer()` appends `&prompt=` + `encodeURIComponent(...)` only when the trimmed prompt is non-empty, so the default request is byte-identical to before.
- api/summary reads `?prompt=` (capped at 2000 chars) and uses it in place of the built-in instruction, keeping the order instruction → notes → language directive. System message, `clean()`, REFUSAL handling and the sparse-week gate are untouched, as specified.
- Added `promptHash(prompt)` to the memo/lock key. Without it, a recap built with a custom prompt could be served from the default-prompt memo for the same week, and two concurrent requests with different prompts would share one lock. This was not in the task file; it is required for the feature to actually take effect.
- Verified live: a forced request with the default prompt produced one paragraph, and a forced request with "Summarize the week as a haiku about sleep and work." produced a clearly different, prompt-shaped answer ("Title: Anxious Hours, Joyful Rituals"), proving the prompt reaches the model. `pnpm run check` 0/0, `pnpm run build` clean, `GET /` and `/api/summary` 200.
- Known limit: the stored weekly recap is keyed by week only, so switching the prompt requires Re-brew (`rf=1`) to take effect on a later load. That matches the existing Re-brew semantic.