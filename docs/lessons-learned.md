# Lessons Learned

## Session: Composer save behavior + model refusal handling
- The "bar changes / input field disappears" bug was `saveNote()` calling
  `onMode('')`. The note input only renders inside `{#if mode === 'note'}`,
  so saving collapsed the composer to just buttons. Fix: removed `onMode('')`
  from `saveNote()` — mode must stay `'note'` after submit.
- The "text not cleared" bug was `bind:value={text}` on a plain (non-$bindable)
  prop, tangled with the unmount above. Fix: made the input controlled —
  `value={text} oninput={(e) => onText(e.currentTarget.value)}`.
- "I'm sorry, but I can't assist with that." on summary reload was a Qwen
  0.5B canned refusal, not a crash. Fixes: (1) `chat()` in models.ts detects
  refusal regex and retries once with sampling (`do_sample:true`,
  `temperature:0.9`, `repetition_penalty:1.1`) + injected user nudge;
  (2) summary endpoint has REFUSAL_FALLBACK per language (en/es/pt) so refusal
  text never reaches the UI.
- Casting a model callable `as never` makes it uncallable in TS; use
  `as unknown as (messages: unknown, opts: unknown) => Promise<unknown>`.
- `svelte:window` tags MUST be top-level in a Svelte component. Placing one inside
  `<main>`/`<div>` fails svelte-check: `svelte_meta_invalid_placement`.
- lucide-svelte 1.0.1 is a deprecated publish. The package root barrel import fails
  under Node/ESM. Use per-icon subpath imports instead: `import Settings from
  'lucide-svelte/icons/settings'` (resolves + typechecks + builds).
- CORRECTED: lucide-svelte is deprecated by Lucide itself ("Please use
  @lucide/svelte instead"). Install `@lucide/svelte` (v1.47.0, peer svelte ^5).
  Import icons per-icon: `import Settings from '@lucide/svelte/icons/settings'`.
  Its exports map serves .js wrappers (not raw .svelte), so Node SSR loads them
  fine. The old `lucide-svelte` package 500s on GET / with
  ERR_UNKNOWN_FILE_EXTENSION ".svelte".
- Svelte 5 `$state` initialized from a prop is flagged as
  `state_referenced_locally`. If the one-time seed is intentional (open-modal
  form), suppress with `// svelte-ignore state_referenced_locally` on the line.
  Wrapping in `(() => ...)()`, object literals, or helper functions does NOT
  silence it and can also change types.
- Do not auto-show the large weekly recap card. `dismissed` defaults to true and
  the "Weekly recap ▾" chip toggles it open. This also fixes the layout-shift
  flicker the user saw (notes appear/disappear on load).
- The Models button must not be gated behind `{#if week && dismissed}`; Models
  status is unrelated to the recap. Render it unconditionally.
- Note save/delete must use non-forced summary refresh (`force=false`);
  `?rf=1` is reserved for the explicit Re-brew button. Forcing on every note
  caused the "bar below changes" complaint (a full recompute + bar flash).
- Language config: `fermentario.config` in localStorage with `{ modelLang,
  entriesLang }` (en/es/pt). Model lang → `?lang=` on /api/summary GET →
  `LANG_DIRECTIVE[lang]` appended to the chat prompt. Entries lang → `r.lang`
  (SpeechRecognition) + Composer placeholder. TTS → `utterance.lang`.
- Anchor-based edits in Python: avoid literal whitespace in multi-line anchors;
  spaces vs tabs caused 5 misses in one batch. When an anchor fails, re-read the
  current file and re-apply with exact bytes rather than guessing.
- Gate: `pnpm run check` (svelte-check) must print `0 errors and 0 warnings`.
  `pnpm run build` is a separate bundle smoke check (types vs bundling).

## Session: Weekly recap grounding + note action menu
- The weekly recap was hallucinating (invented a product launch from 4 trivial
  notes). Root cause: it used `retrieve('this week journal', {topK:8})` — RAG
  vector similarity to an abstract query — plus a prompt that DEMANDED themes,
  moods, worries, wins and "their startup", which a tiny 0.5B instruct model
  fills with fabricated boilerplate. Fix: feed the recap the ACTUAL week's notes
  (`notesBetween` → `contextFor`, no retrieval) and rewrite the prompt to be
  strictly grounded ("Only reflect these notes; never invent events/numbers/
  people/products/meetings; if notes are short, say so plainly; do not mention
  the startup unless the notes do").
- A 0.5B instruct model still emits chatty meta ("Sure, here's a summary:…",
  "This summary captures the essence…", "Thanks for sharing!"). Defense in
  depth: (1) sampling instead of greedy decode for the recap (`sample: true` →
  `do_sample, temperature 0.9, repetition_penalty 1.1`) avoids the templated
  greedy path; (2) `clean()` strips model preamble up to a `:\n\n` boundary,
  keeps only the first paragraph block (drops trailing meta-commentary), and
  strips wrapping quotes; (3) maxNewTokens cut 220 → 140 to force brevity.
- The 0.5B model's grounding is near its ceiling; prompt-only fixes remove
  gross fabrication but not all color. The real cure is a larger instruct model
  (e.g. Qwen2.5-1.5B-Instruct) — offered to the user, who chose prompt-only for now.
- Dev port: vite.config.ts now pins `server: { port: 4173, strictPort: true }`.
  strictPort makes Vite fail loudly instead of silently hopping (5173→5174→5175).
- Per-note controls: the ▶/× text glyphs were unusable on mobile. Replaced with
  a single `ellipsis-vertical` icon button opening `NoteActionsMenu.svelte`
  (bottom-sheet on mobile via `place-items-end sm:place-items-center`, big
  `min-h-11` targets: Read aloud / Copy with feedback / Delete). Delete then
  opens the reusable `ConfirmDialog.svelte` (`title, message, confirmLabel,
  cancelLabel, confirmTone, onConfirm, onCancel`) — built as a generic component
  for use by any future destructive action in the project.
  - Reusable dialog pattern: fixed inset z-50 backdrop, `role="dialog"`,
    `aria-modal="true"`, `tabindex="-1"`, backdrop-click + Escape close,
    destructive confirm tinted rose, label defaults Delete/Cancel.

## Session: honest summaries + selectable chat model
- 0.5B still fabricates even with a minimal prompt (measured: fabricated recap
  scored 0.615 cosine vs the best-matching real note — a similarity guard
  would NOT reliably catch it). Prompt-only fixes remove gross fiction but not
  invented color; the 0.5B model cannot faithfully paraphrase.
- Final approach (shipped): TWO mechanisms, no reliance on the model's
  honesty. (1) A deterministic sparse-week gate in api/summary: if the week's
  combined note text is under 40 words, skip the LLM entirely and emit an
  honest recap quoting each entry verbatim ("The notes this week were just a
  few short entries: "...", "...". There was no other content."). Fabrication
  is structurally impossible for sparse weeks. (2) For substantial weeks the
  LLM runs with the minimal prompt (system: "You write short summaries of
  private journal notes."; user: "Write one paragraph summarizing the following
  notes. Do not make things up, just a short summary of what's in the notes:")
  — the earlier verbosity constraints and 3-5 sentence minimum were REMOVED;
  a minimum length is a trap that forces padding on sparse content.
- Model is now selectable. Shared list lives in client-safe src/lib/chat-models.ts
  ({id,label,detail} options; ids '0.5b'|'1.5b'). Server maps id→repo in
  models.ts (CHAT_REPO), `setActiveChatModel(id)` resets chatPromise +
  modelProgress.chat so a switch reloads. `getActiveChatModelId()` exposed on
  /api/status. The summary GET takes ?model=<id> and applies it (this also
  selects the model the composer /api/chat uses, since it's process-global
  server state). UI: the model selector lives in the Models &amp; status modal
  (ModelsModal.svelte), replacing the static "Summary model" row, next to the
  Re-brew recap button. It is NOT in the Weekly card — the user was explicit the
  model config belongs in the Models modal only. +page passes model/models/
  onModelChange into ModelsModal; choice persists in fermentario.config as chatModel.
- saveConfig must MERGE partials (`config = { ...config, ...p }`), not replace —
  ConfigModal sends only langs and would otherwise wipe the chatModel choice.
- id→repo mapping lives once in src/lib/chat-models.ts (ChatModelOption.repo);
   models.ts derives CHAT_REPO from it, and ModelsModal shows the repo of the
   selected model. Keep optional-vs-required prop lists in sync between +page
   and components (svelte-check enforces it, 0 warnings).

## Session: model readiness gating + cursors (no more "hangs")
- First honest check: model folders in the cache are NOT proof the weights are
  there. Qwen2.5-1.5B-Instruct had config/tokenizer + only partial
  `model_int8.onnx.tmp.*` files — a download that never finished. Always verify
  the actual weight file `onnx/model_int8.onnx` exists before claiming a model
  is downloaded. `chatDownloaded` now checks exactly that file, not the folder.
- `warmChatModel()` must swallow its promise rejection. loadChat() rethrows
  after setting phase=error; a fire-and-forget warm call left the rejection
  unhandled → Node 24 crashed the whole dev server (ELIFECYCLE) on a missing
  weight file. Use `void ensureChatLoad().catch(() => {})`.
- NEVER gate `allowRemoteModels=false` on folder existence: a partial cache
  throws `ModelFileNotFoundError` and kills the process. Only force local-only
  when the exact weight file is present; otherwise leave remotes on so the
  model can genuinely download.
- Do not auto-warm on every /api/status poll. Loading a missing model started a
  background download on each 4s poll and re-created partial .tmp files.
  /api/status now warms ONLY when `chatDownloaded(id)` is true (disk load, no
  network). Unowned downloads start only on an explicit dropdown switch or the
  Re-brew button.
- Truthful status contract: GET /api/status exposes `chatModel`,
  `chatReady` (loaded id === selected id && pipeline built), `chatDownloaded`
  (weight file present), plus progress.chat {phase,pct,message}. The summary
  route still takes ?model= and re-fetch adds &model=config.chatModel.
- ModelsModal Re-brew button states (gated on chatReady, matching the user's
  complaint "I can re-brew before the new model has finished"): Brewing…
  (summary running) / Re-brew recap ↻ (enabled only when chatReady) /
  Loading model… or Downloading model… {pct}% (disabled) / Download model &
  re-brew (enabled only when weights are missing AND not started — the honest
  way to begin a real download).
- Loading a model into onnxruntime-node blocks the main thread during session
  creation; a large/streaming 1.5B load can stall status polls for a while.
  Keep the selected default (0.5B) cached so the normal path never downloads.
- Tailwind v4 REMOVED the CSS preflight rule that set `cursor: pointer` on
  buttons. Add a global recovery in src/app.css `@layer base`:
  `button:not(:disabled), select:not(:disabled), [role='button']:not(:disabled)
  { cursor: pointer; }` and `button:disabled { cursor: not-allowed; }`.
  The Settings backdrop keeps its deliberate `cursor-default`.
- Verify a dev server is actually alive after a crash (curl GET / → 200); a
  wedged/choken process returns 000 or empty bodies while still holding the port.
  Refuses: node process exits 1 with `[ELIFECYCLE] Command failed` when a model
  load rejects — check /tmp/ferm_dev*.log before reporting a hang.

## Session: Re-brew must always recompute + card spacing
- The Re-brew button "did nothing" once a recap existed because api/summary had
  TWO shortcuts: the stored recap (which respected `force`) AND a module-level
  in-memory memo (`cache` keyed on countNotes:latestTimestamp) that did NOT
  respect `force`. Every brew warms that memo, so clicking Re-brew returned the
  memoized text instantly and never ran the LLM. Fix: `if (!force && cache?.key
  === key)` — `rf=1` now always recomputes; non-forced refreshes (page load,
  note save/delete) still use memo/stored recap.
- Two cache layers with different force semantics is a footgun: when adding a
  short-circuit in route handlers, gate EVERY cached layer on the same flag.
- Spacing around the Weekly card: header was `mb-10`, card section had no
  margin. Adjacent positive vertical margins COLLAPSE to the larger value
  (CSS), so adding the card's own `mt-5` while keeping header `mb-10` would
  still render a 2.5rem gap. Fix: header `mb-10`→`mb-5`, card wrapper section
  `mt-5 mb-5` → symmetric 1.25rem above and below with the heading row and the
  timeline.
- After the memo fix, Re-brew on a sparse week finished in ~1ms (deterministic
  gate), so it *felt* like "does not process". User-facing fix (chosen over
  bypassing the sparse gate, which would re-enable LLM fabrication): enforce a
  minimum visible processing window in the client — measure the fetch round
  trip, pad to 900ms, and keep `summaryLoading` true until then — so an
  explicit Re-brew always shows the "Brewing…" state. Set `summaryLoading =
  false` in a `finally`, not after the await.
- Re-brew must also reveal the (dismissed) Weekly card when it finishes:
  `if (withLoading && d.exists) dismissed = false;` in refreshSummaryAnswer.
  Only the modal's Re-brew passes withLoading=true, so note save/delete and the
  initial load never pop the card open.

## Session: /api/chat is SSE, not JSON; FTS5 needs sanitized queries
- /api/chat returns a `text/event-stream`. The client handler still did
  `fetch(...).then((r) => r.json())` and read `d.answer` — streaming predated
  the handler, so every Ask threw and showed "Something went wrong asking the
  archive." Fix: `handleAsk` reads `res.body` with a TextDecoder, splits frames
  on `\n\n`, appends `{t}` token events to the answer, throws on `{error}`.
- Flip side of the same bug surface: raw user questions passed into
  `notes_fts MATCH ?` crash FTS5 — `?`, `"`, `*`, `:`, etc. are query syntax
  ("fts5: syntax error near "?""). The sanitizer lives INSIDE ftsCandidateIds
  (db.ts): split to word tokens of 3+ letters, double any embedded quotes, and
  join as `"t1" OR "t2"`. Empty safe terms → skip FTS, cosine-only retrieval.
  Never hand free-form user text to MATCH.
- Test Ask end-to-end with curl and parse the SSE frames (160 events, tokens,
  done) rather than expecting a single JSON body. A 0.5B model may still emit
  an inline "I'm sorry…" prefix before its actual answer — that is model
  behavior, not a transport bug.

## Session: mobile composer bar
- Mobile bottom bar was too crowded (Note + Ask + input + Speak + Save). Rework
  Composer.svelte responsive: below `sm` the mode switch is a compact segmented
  control (`Note | Ask`, active pill `bg-stone-900 text-white`), the input is
  ALWAYS visible (before, mode `''` rendered a bar with no input at all — the
  user had to tap Note first), speak collapses to a circular mic icon
  (`@lucide/svelte/icons/mic`), and the primary action (Save/Ask) stays.
  Desktop (`sm:`) keeps the previous layout. Note the `hidden sm:flex` /
  `sm:hidden` pair for the two switches.
- Mobile toggle no longer supports deselecting to `''` (mode `''` ≈ note in the
  render condition), so switching is direct: Note→'note', Ask→'ask'.

## Session: Ask input clear + grounded sources
- Ask input did not clear on submit even after `onQuestion('')` was called.
  Root cause: the input used `bind:value={question}` on a NON-$bindable prop —
  the local write works while typing but the parent push is racy. Replace with
  the same controlled pattern as the note input: `value={question}` +
  `oninput={(e) => onQuestion(e.currentTarget.value)}`, then prop writes
  (including `''`) always flow. Rule: NEVER `bind:` a plain prop in Svelte 5;
  use value+oninput+callback.
- "The Ask has no clue of the notes": retrieval actually works (the SSE
  `done` event returned all 4 real notes as sources). The 0.5B model just
  ignores the grounded context and fabricates a generic reply. Fix at the UX
  level, not the model level: /api/chat now includes `content` on each source
  note in the done event, and Composer renders a "Source notes" list under the
  answer with the actual excerpts. The user always sees which notes were used,
  even when the model rambles. (A larger model is the real cure mid-term.)

## Session: Notes/Ask top tabs + persisted ask history
- New `ask_history` table (id, question, answer, sources JSON, created_at),
  auto-created at db.ts module load. Helpers: insertAsk (returns uuid),
  listAsks (ASC by created_at), deleteAsk. New routes: GET /api/asks,
  DELETE /api/asks/[id].
- /api/chat persists each completed Q&A server-side BEFORE emitting the done
  event, and the done event carries `entryId` — the client appends the entry
  locally from that id (no reload flicker). Save is wrapped in try/catch so a
  DB failure never breaks the SSE stream.
- Top-level view is now `view: 'notes' | 'ask'` in +page, switched by pill
  tabs under the header (active pill bg-stone-900 text-white). Notes view
  renders Weekly + Timeline; Ask view renders the new AskTab thread. Save note
  -> view 'notes'; submit ask -> view 'ask' (user-requested auto-tab).
- Composer bottom bar: the Note/Ask switch is GONE — top pills are the single
  switcher (solves the earlier "too many bottom buttons"). Bar is now just
  input + mic + primary action per view. Mic fills whichever input the current
  view has (onText for notes, onQuestion for ask).
- AskTab: scrollable history (per-entry × DELETE), live streaming entry while
  answering (spinner), collapsible "Source notes" via native <details>,
  auto-scrolls to bottom in an $effect on the bound container. The old floating
  answer box is removed — the thread is the single source of truth for answers
  and closes via per-entry ×.

## Session: AI auto-tags (task 001)
- New `note_tags` table (note_id FK ON DELETE CASCADE, tag, PK (note_id, tag)).
  `Note.tags` lives in BOTH src/lib/server/db.ts and src/lib/types.ts — miss
  the client one and svelte-check fails with "Property 'tags' does not exist"
  on the derived grouped list in Timeline.
- Never query tags per note in a loop. `tagsByNote(rows)` builds one
  `WHERE note_id IN (?,?,…)` query for the whole page; `withTags(rows)` maps the
  result back. listNotes(500) would otherwise mean 500 round trips.
- Tagging is fire-and-forget everywhere: POST /api/notes does
  `void tagNote(...)` and returns 201 immediately; GET /api/notes awaits
  `ensureTags()`, the single-flight `ensureIndexed()` analogue. `ensureTags`
  gates on `getChatModelReady()` so it never forces a model load from a GET.
- THE 0.5B MODEL CANNOT TAG. Live probes returned: the user prompt echoed back
  verbatim, meta-plans ("To complete this task, I will follow these steps"),
  a "Red Herring" logical-fallacy answer, and a Python class definition. Same
  failure class as the Ask feature. Treat any structured output from 0.5B as
  untrusted and validate it before it reaches the database.
- Prompt wording made no difference: "Output ONLY…", "Tags for X are:", and
  "nothing else" all failed. Do not spend cycles tuning prompts for 0.5B.
- Lesson: an output filter must be stricter than "it is a string". The first
  `cleanTags` stored `tagged "cooked" before "pasta` because a 1-item,
  comma-less junk line passed the per-token checks. Now reject: quotes left in
  the token, >40 chars, >4 words, and require >=2 tags total. Refuse-on-parse
  is the correct default for model output.
- When the active dev server's stdout is not captured, `console.error` is
  invisible. Debug by appending to a /tmp file from the server module, and
  remember a stale /tmp/ferm_dev*.log can be attached to a dead process —
  check the log mtime against the running PID before trusting it.
- sqlite3 CLI has foreign_keys OFF by default, so a manual DELETE there can
  orphan child rows that better-sqlite3 would have cascaded. Delete test rows
  through the API so the real cleanup path runs.

## Session: Edit notes (task 002)
- NEVER test a write endpoint against the user's real data. PATCH was verified
  against their only real note and overwrote it. The full original was recovered
  from an uncheckpointed WAL page with `strings data/fermentario.db*` (also
  present in the ask_history source copy), then restored. Create a throwaway
  note for write tests and delete it through the API afterwards.
- A user note may also be recoverable from a sibling feature: `/api/chat` stores
  source note content verbatim in ask_history, so an accidental edit is usually
  recoverable even after the notes row is overwritten.
- SQLite FTS5 virtual tables have no UPDATE. Rewrite them as
  DELETE + INSERT (done in `updateNote`). Also, the system `sqlite3` CLI on this
  machine has no FTS5 module ("no such module: fts5"), so FTS checks must run
  through the app's own better-sqlite3 from `node -e`.
- `updated_at` must be forced past `created_at`
  (`Math.max(Date.now(), created_at + 1)`) because notes can be created with a
  backdated `created_at`, and a same-millisecond write would leave the note
  un-flagged as edited.
- Editing invalidates derived data: the vector and the tags describe the old
  text. Re-embed with `indexNote` and clear + retry `tagNote` in the background.
  Clearing the tags (instead of keeping stale ones) lets `ensureTags()` pick the
  note up on a later GET /api/notes.
- `let x = $state(prop.value)` in a Svelte 5 component triggers the
  `state_referenced_locally` warning, and the repo gate requires 0 warnings.
  Fix without an ignore comment: own the state in the parent and make the child
  a controlled input (`value` + `oninput` + callback) — the same rule already
  learned for the composer inputs.

## Session: Desktop tab shortcuts (task 003)
- Tab switching uses a two-key sequence: `G` then `N` / `G` then `A`, with an
  800 ms pending window. A bare letter key would steal typing, and Cmd/Ctrl+1
  is taken by the browser tab bar, so a sequence is the safest option here.
- Any single-key shortcut handler must guard on all of: `metaKey || ctrlKey ||
  altKey`, `isComposing` (the app has es/pt input, and a pending IME
  composition fires keydown with `key === 'Process'`), and the event target
  being INPUT/TEXTAREA/SELECT/contenteditable.
- The pending key must be cleared by the timer, by the next first key, and by
  the previous clear call — otherwise a stale `G` can activate a shortcut
  seconds later after the user moved on.
- Kbd hints use `hidden ... sm:inline-flex`, which hides them on phones by
  width. The alternative is a `(pointer: fine)` media query if hints must also
  disappear on touch tablets.
- `aria-hidden="true"` on the kbd span plus `aria-keyshortcuts="G N"` on the
  button gives screen readers the shortcut without repeating the hint.
- Verified only through SSR output (`curl | grep`): keydown behaviour itself
  cannot be checked without a desktop browser session.

## Session: Universal tab shortcuts + hashtag tags (task 004)
- NO plain `Ctrl`/`Cmd` + digit web shortcut is possible. Chrome's own docs list
  "Jump to a specific tab — Ctrl + 1 through Ctrl + 8" (and `Ctrl+9` last tab)
  for Windows, Linux and macOS, and Firefox and Safari bind the same family.
  The browser consumes the key, so the page never sees it. Every letter is also
  taken with plain Ctrl/Cmd (select all, bookmarks, omnibox, new tab, print...).
  `Ctrl`/`Cmd` + `Shift` + `1/2` is unbound in Chrome, Edge, Firefox and
  Safari on all three desktop platforms — that is the "universal" chord.
- When a shortcut needs the platform primary modifier, detect it at runtime
  (`navigator.userAgentData.platform` → `navigator.platform` → UA string) and
  set the state in `onMount`. Doing it during SSR renders the wrong symbol and
  causes a hydration swap; the `apple` state starts false, so SSR emits the
  Control variant and flips after mount.
- Windows `AltGr` sends `ctrlKey: true, altKey: true`. Any Ctrl chord must
  require `!altKey` or it fires while the user types `!`, `@`, or `€`.
- A "hashtag at the end" parser must walk backwards from the end of the string,
  otherwise the first match in the text wins. Anchoring the last token with `$`
  and looping on `rest.slice(0, m.index)` handles a whole trailing run.
  Requiring `(?:\s|^)` before `#` is what stops `url.com/#anchor` from being
  tagged; requiring a letter/digit right after `#` stops markdown headings.
- `exec()` without the `g` flag returns the first match, never the last. With
  the `$` anchor it matches the final token, which is what the backwards walk
  needs.
- When a route clears a child table after `updateNote()` returned the row, the
  returned object still holds the old child array. Assign `note.tags = []` after
  the clear or the API answers with stale data (caught by a live edit test).
- Test notes for hashtag and tag work must be deleted through the API after the
  run, and the user's real notes must be identified by content before any
  cleanup query.

## Session: Auto-growing composer (task 005)
- Auto-growing a textarea in Svelte 5 needs `height: auto` before reading
  `scrollHeight`, otherwise the element can only grow, never shrink:
  `el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'`.
- The input in this app is controlled, so the value changes from the parent
  (voice input, clearing after save, `onQuestion` from Ask). Growing only in
  `oninput` misses every one of those. An `$effect` that reads the value prop
  and calls the resize helper catches all of them.
- The textarea is remounted when the view switches, because both inputs live in
  separate `{#if}` branches. The resize effect must also depend on the element
  ref: `autosize()` reads `field`, so `$effect` tracking `field` re-runs after
  the new element is bound.
- `max-h` and an inline `height` can disagree: the inline height may be 2000px
  while `max-h-[45dvh]` clamps the layout. That is the desired result, the
  textarea scrolls internally past the cap.
- A fixed-position bar that can grow needs the page to reserve matching space.
  A `ResizeObserver` on the bar root writing `--composer-h` to `:root`, plus
  `pb-[calc(var(--composer-h,4.5rem)+2.5rem)]` on the content wrapper, keeps the
  last entry visible. Always give the variable a fallback: it is undefined on
  the first paint. This also covers bar-height changes that are not typing, such
  as the dashed hashtag chips appearing.
- Shift+Enter for a line break while keeping Enter as submit preserves the
  existing keyboard habit once a multi-line box allows newlines at all.

## Session: Optimistic note save (task 006)
- A "slow save" was not the save. `POST /api/notes` returned in 65 ms; the wait
  was the follow-up `GET /api/notes`, which awaited `ensureTags()` and
  `ensureIndexed()`. Never await model or embedding work on a list endpoint.
- A best-effort background pass MUST record what it already tried. `ensureTags`
  re-tagged the same notes on every request, because a model that cannot
  produce parseable output leaves the note untagged and the next request sees it
  as missing again. The result was an infinite generation loop: the vite process
  at ~400% CPU and every request queued behind inference, which looked exactly
  like a slow page. A per-process `attempted` set fixed it; verify such loops by
  sampling `ps -o %cpu` before blaming the request path.
- `ensureIndexed()` reset its single-flight promise only in `.catch`, so after
  one successful pass it returned the cached resolved promise forever and no
  note created later ever got a vector. Those notes were invisible to Ask
  retrieval. A cache-check pass must reset in `.finally`.
- Detecting a wrong value in the response is not enough: `updateNote()` returned
  the row before the caller cleared its tags, so the API answered with the old
  array until `note.tags = []` was assigned after the clear.
- `crypto.randomUUID()` is unavailable outside a secure context. The app is
  served over plain HTTP on the tailnet, where it is `undefined` and any call
  throws. Use `Math.random()`-based ids for client-side temporary records.
- In Svelte, `textErr` was assigned in three places and never rendered, so save,
  delete and load failures were completely silent. An error state that is not in
  the template does not exist.
- Optimistic UI needs a rollback: remove the temporary entry, restore the text
  the user typed, and show the error. Keep the parsed tags on the optimistic
  entry so the chips appear immediately.
- Running transformers.js inference on Node's main thread means any request
  arriving while the model generates waits. When the app feels slow, check
  whether another endpoint is busy generating before optimizing the endpoint
  the user complained about.

## Session: Tag pages (task 007)
- A chip that filters should be a real `<a href>`, not a button with a click
  handler. SvelteKit intercepts same-origin links, so it stays a client-side
  navigation, and middle-click, "open in new tab" and no-JS rendering come for
  free. `encodeURIComponent` the tag: tags can hold spaces, `#` or non-ASCII
  letters.
- SvelteKit route params arrive percent-encoded, so decode before using them as
  a tag to compare against what is stored.
- A filtered query should not reuse the paginated timeline: `listNotes(500)`
  silently hides older matches. `listNotesByTag` joins `note_tags` with no
  LIMIT, and `withTags` still attaches every card's chips.
- A tag request must skip the background `ensureIndexed`/`ensureTags` passes.
  They only exist to catch up the main list, and on a filtered page they are
  pure CPU cost.
- Reusing `Timeline` on a second route needed no prop changes beyond `lang`,
  which the new page reads from the same `fermentario.config` localStorage entry
  the main page writes. `invalidateAll()` is the simplest way to refresh a page
  whose data comes from a load function after a delete or edit.
- Verified the chip link and the filtered page through SSR output (`curl | grep`),
  since chips are rendered client-side only on the main page.

## Session: Load more pagination (task 009) and configurable summary prompt (task 008)
- Cursor pagination needs the tiebreak column. Ordering by `created_at DESC`
  alone skips or repeats notes saved in the same millisecond; the cursor must be
  `(created_at, id)` and the condition `created_at < ? OR (created_at = ? AND id < ?)`,
  with `id` compared as text because it is the primary key.
- Fetch `limit + 1` to compute `hasMore` instead of a second COUNT query.
- Remove the old listing helpers when replacing them. `listNotes(500)` had a
  hard cap and `listNotesByTag()` had none; keeping both meant two ways to list
  notes and the cap was one edit away from coming back.
- A "load more" pass over the whole table to find a few missing rows does not
  scale: `ensureIndexed()` used `listNotes(100000).filter(...)` plus
  `allVectors()`. `LEFT JOIN note_vectors WHERE v.note_id IS NULL LIMIT n` makes
  the per-request cost constant.
- Shared paginated state belongs in one place. `NotePager` in a `.svelte.ts`
  module (runes in class fields need that suffix) is used by both the timeline
  and the tag pages; the tag instance filters appended pages by tag so a
  mismatched response cannot mix unrelated notes in.
- Optimistic prepend plus cursor pagination compose safely: new notes are newer
  than the cursor, so later pages never repeat them. Delete and edit must patch
  the local list instead of refetching, or an accumulated list collapses back to
  one page and the scroll position is lost.
- A quiet background refresh must patch known notes and ignore unknown ones
  (`sync()`); fetching page one and assigning it to the list is a trap.
- Grouping by day with `list.filter((x) => x.day === day)` inside the day loop
  is O(days × notes) per render. Build a `Map` in one pass and iterate the
  entries. Key the `{#each}` by the note id so appending a page does not remount
  every card.
- Any server-side prompt or option that changes the output must be part of the
  memo/lock key. A `promptHash()` in the key stopped a custom-prompt recap from
  being served from the default-prompt memo for the same week.
- Task numbering collides when the user adds a task mid-session. The pagination
  task was renumbered 008 → 009 (file renamed with `mv`, content untouched) so
  the new `008 Configurable summary prompt` kept its number.
- A stored per-week artifact (the weekly recap) is shared across prompts, so a
  changed prompt only takes effect on Re-brew. Say so in the notes rather than
  adding a schema column for it.
## Session: Duplicate Ask card fix
- The Ask thread rendered every answer twice: `handleAsk` appended the finished
  answer to `asks` and never cleared `answer`, so AskTab's history loop AND its
  live block (`{#if answering || answer}`) both matched. One flag caused it.
- Rule for live-to-persisted handoff: when a streamed result is committed to
  history, clear the live state in the same branch, and only clear it when the
  commit actually happened (`entryId` present and text non-empty). Otherwise a
  failed persist silently deletes the answer from the screen.
- The client built the history entry from the streamed buffer and ignored the
  `full` field the server already sends in the `done` event. Prefer the server's
  final text so the card and the stored row cannot diverge; add the field to the
  event type when you start using it.
- SSE verification writes real rows: `POST /api/chat` inserts into ask_history
  before the done event. Delete those test rows through `DELETE /api/asks/[id]`
  after checking, and match on the exact questions used in the test.
- Optimistic entries live under a temporary id, so the success path must swap
  them by that id. `patch(saved)` matches on the *server* id and therefore
  matched nothing: the card kept `pending: true` forever, and because the 4 s
  quiet refresh only runs when no entry is pending, the stale card also blocked
  the refresh that would have fixed it. Symptom looked like "the note saved but
  the spinner never stops, and a reload fixes it".
- Keep `patch` (match by a note's own id, for edits) and `replace(fromId, note)`
  (swap by a different id, for the optimistic handoff) as separate methods. Two
  id semantics in one method is how this bug happened.
- A quiet refresh should also drop temp cards the server does not know, so a
  POST that died mid-flight cannot leave a permanent placeholder.

## Session: Ask thread newest-first
- Order lives in three places and all three must agree: the SQL in
  `listAsks()` (`ASC` was the bug), the client's append
  (`asks = [...asks, entry]` pushes the newest answer to the bottom), and the
  position of the live/streaming card. Changing only the SQL moves the whole
  history to the top while new answers still stream at the bottom and then jump.
- A live card that is replaced by a saved card must render in the same position
  in both states. Moving it above the history loop makes the handoff in-place.
- The old auto-scroll effect (`scrollTop = scrollHeight`) only tracked
  `threadEl`, so it ran once on mount and never followed new entries. Track a
  key derived from the newest entry id (plus "streaming") in a plain, non
  reactive variable: a `$state` tracker would re-trigger its own effect, and
  scrolling only on a real change leaves a user reading history undisturbed.
- Verify ordering with two throwaway asks and compare the returned array against
  a client-side sort; delete them through `DELETE /api/asks/[id]` afterwards.

## Session: model label, database export, stop an answer
- The select in the Models modal was labelled "Summary model" but it is the one
  chat model used by BOTH the weekly recap and Ask (`api/chat` never picks a
  model; it uses the single `activeChatModelId` slot). Renamed to
  "Summary & Ask model", with the 1.5B detail changed from "better summaries" to
  "better answers & recaps". The MiniLM row is the embedding model: it only
  turns text into vectors for retrieval, it never writes an answer.
- Downloading a SQLite database that runs in WAL mode by copying the main file
  hands out a stale copy, because recent writes sit in `-wal`. Run
  `PRAGMA wal_checkpoint(TRUNCATE)` first, then stream the file. Verified the
  download with `PRAGMA integrity_check` and row counts.
- To stop a streaming answer: pass an `AbortSignal` into `chat()` and throw from
  the `TextStreamer` callback when it is aborted. The callback runs between
  decode steps, so unwinding the generation loop does not corrupt the ONNX
  session; call `resetModel('chat')` afterwards so the next ask loads a clean
  pipeline. transformers.js has no generation-level abort hook.
- A cancelled answer must never be persisted: `api/chat` checks
  `request.signal.aborted` after `chat()` resolves and skips `insertAsk`, so a
  partial reply cannot reappear later as a finished history entry.
- Enqueuing on an aborted `ReadableStreamDefaultController` throws. Wrap
  `sseEvent` and `close()` in the route's catch/finally when a client can
  disconnect mid-stream.
- The client must distinguish a user cancel from a failure: keep the partial
  text, mark it "stopped — not saved to history", and skip the error toast. The
  composer's Ask button becomes Stop while `answering` is true.

## Session: Import database (task 011)
- Never swap the database file while the server holds it open: the process
  keeps writing to the deleted inode. Restore by `ATTACH`ing the upload to the
  live connection and copying the tables through it in one transaction.
- `db.exec()` does NOT bind parameters. `ATTACH DATABASE ? AS backup` in `exec()`
  silently attaches an empty temporary database (NULL/empty filename) and the
  failure appears much later as "no such table: backup.notes". Use
  `db.prepare(...).run(path)` or inline the path with quotes escaped.
- A transaction spanning an attached WAL database commits into the main WAL
  only. Nothing else sees the change — not another SQLite connection, not the
  file — until a checkpoint. `wal_checkpoint(TRUNCATE)` right after the import,
  or the next download hands out the previous contents. This is the same reason
  the export checkpoints first.
- A read-only SQLite connection that cannot read the WAL reports the last
  checkpointed state, which looks exactly like "the write did not happen".
  Verify through the app's own API, or force a checkpoint, before concluding
  that a write was lost. This cost two false conclusions.
- SQLite opens files lazily: a text file or a truncated database throws on the
  first read, not on `new Database(...)`. Wrap the whole validation block
  (open, `quick_check`, schema query) and answer 400 with the real reason;
  reserve 500 for the apply phase.
- Deleting an uploaded temp file is not enough. Opening it creates `-shm` and
  `-wal` siblings next to it; unlink all four suffixes or the data dir fills
  with orphans.
- Deleting `notes` cascades into `note_tags` and `note_vectors`
  (`foreign_keys = ON`), so the import only needs four DELETE statements, and
  the children must not be emptied first.
- `notes_fts` is a regular fts5 table, so it can be repopulated with
  `INSERT INTO notes_fts (content, note_id) SELECT content, id FROM notes`
  after the import. (`'rebuild'` is only for external-content tables.)
- The summary memo lives in module state, so the import could not clear it
  from the route; it moved to src/lib/server/summary-cache.ts.
- zsh aborts a whole command line when one glob has no match
  (`rm data/import-*.db-journal` killed the other deletes). Pipe `ls` into a
  loop when a file may not exist.

## Session: focus composer shortcut
- `Ctrl`/`Cmd` + `L` is address-bar territory in Chrome, Edge, Firefox and
  Safari, exactly like the tab digits, so the page never sees it. `Ctrl`/`Cmd` +
  `Shift` + `L` is unbound everywhere and reuses the guard chain already written
  for the tab shortcuts: platform modifier, `shiftKey`, `!altKey` (AltGr on
  Windows reports Ctrl+Alt), `!isComposing`, no modal open, not already inside
  an editable element.
- The Composer renders one of two textareas in different `{#if}` branches, so a
  single `id="composer-field"` is unique in the DOM at any moment and the same
  `getElementById` + `focus()` + `setSelectionRange(len, len)` works in both
  views without passing refs across the component boundary. Caret at the end
  continues the sentence; selecting all would be replaced by the first keystroke.
- Platform symbols belong in the placeholder as plain text (a placeholder cannot
  render the `Kbd` component), and the page's existing `apple` flag is passed
  down for it. Interim speech text replaces the whole placeholder, so the hint
  disappears while dictating.

## Session: Restore UX (task 012)
- A destructive action needs a confirm gate that names the file and states
  exactly what is lost and that it cannot be undone. A warning paragraph under
  the button is not a gate: one click replaced the journal.
- Long blocking requests need real phases, not a spinner. The import already had
  five steps, so `POST /api/import` became an event stream and each step emits
  its event immediately before running. Open the stream BEFORE reading the
  request body, otherwise the slowest part (a big upload) is invisible.
- Emit phases from inside the transaction, not only between calls: the FTS
  rebuild is a separate statement, so `search` can be reported while the
  transaction is still open, and a failure there still rolls back.
- "Nothing appeared to happen" after a data replacement usually means the
  refresh happened behind a closing modal. Confirm the result in the open UI: a
  toast with the real counts from the server, not a silent refetch.
- Generalize the toast (`{ text, tone }`) instead of adding a second success
  element next to the error one. Reuse the /api/chat SSE reader shape.
- REGRESSION CAUGHT BY A COUNT CHECK: rewriting the import route dropped
  `DELETE FROM notes_fts`. FTS5 tables have no foreign key, so deleting from
  `notes` does not clear the index: every restore stacked another copy (4 notes,
  13 index rows) and a deleted note stayed searchable. Assert
  `count(notes_fts) === count(notes)` after any restore, and that a known
  deleted phrase no longer matches.

## Session: Heatmap + copy loaded notes (task 013)
- `navigator.clipboard` needs a secure context. Over plain HTTP (the tailnet URL
  the app is actually used on) it is `undefined`, so every copy path must handle
  it. The fallback is a dialog with the text pre-selected plus a Blob download;
  `document.execCommand('copy')` on the selection still works there.
- When copying notes, append the tags: task 004 strips trailing hashtags out of
  the stored content, so a copy of `content` alone silently loses them.
- Show what a "copy everything loaded" button will copy. The loaded count and
  the server total differ as soon as Load more is used, so the label must come
  from the pager, not from `countNotes()`.
- Daily counts: `SELECT date(created_at/1000,'unixepoch','localtime') … GROUP BY
  day` in one query, and fill the zero days on the client. `localtime` matches
  the `en-CA` day keys used everywhere else only because server and browser share
  a machine; a remote deployment must pass the zone in.
- A calendar grid per month needs leading blanks computed from the weekday of
  day 1 (`(getDay() - FIRST_WEEKDAY + 7) % 7`) and a trailing partial week.
- Heatmap cells as `<button tabindex="-1">` satisfy the a11y rules for click
  handlers while keeping thousands of cells out of the tab order. Plain
  `<span on:click>` triggers two warnings, and the gate requires zero.
- THIRD time: a direct SQLite read showed pre-checkpoint counts and looked like
  data loss. Trust the app's API or checkpoint first; a separate connection that
  cannot read the WAL only sees the last checkpoint.
- Heatmap defaults that read wrong: `bg-stone-100` for a zero day is nearly
  invisible at 12px against the page background (empty days vanished), so use
  `bg-stone-200` for the neutral step and keep amber for the first count bucket.
- Month groups are built ascending and then `reverse()`d, because reversing
  during the build loop makes the cursor walk backwards. Newest-first means the
  latest days are in the first column and the scroll container starts there for
  free.
- A month label row needs a "last labelled month" variable, not just "month of
  this column": every January column has a January day, so the naive version
  printed `Jan Jan Jan ...`. Verify label rows by reading the rendered sequence
  out of the SSR HTML, where duplicated labels are obvious.
- A continuous year grid: start on the Monday on/before 1 January, end on the
  Sunday on/after 31 December, and compare day keys as strings to mark future
  days. Test the leap year too (366 cells, 53 columns).
- Name the action's scope on the button ("Copy all", not "Copy") and keep the
  exact count next to it, because "all loaded" is a different set from "all
  stored" once pagination is involved.
- A year cannot tile a 7-row grid: 365 = 52×7+1 and 366 = 52×7+2, so a
  "complete rectangle" either needs the slack at the end of the last column or
  calendar alignment with padding days from December at the top left. State the
  arithmetic when the choice is a layout preference.
- Sequential packing (7 days per column from 1 January) gives a flush top-left
  edge and a short final column, at the cost of weekday meaning per row. Drop the
  weekday row labels with it rather than leave labels that lie.
- `bg-transparent` plus an inset ring reads as "no square" at 12px. Anything that
  must still look like a filled cell needs a fill colour; a 98-cell block of them
  was the real reason the heatmap looked misaligned.
- Count rendered cells per style from the SSR HTML and add them up against the
  year's day count. It catches padding, double-counting (a legend swatch shares
  a class with grid cells) and missing cells in one step.
- Two neutral styles for "no data" (past empty vs not yet) make a heatmap look
  broken even when each style is individually fine. Use ONE style for every
  zero-count cell, and move the distinction into the tooltip text where it costs
  no visual noise. The cost of losing the "where does the year end" cue is worth
  naming out loud rather than solving with a second colour.
- When a marker must not disturb a uniform scale, change the marker's opacity
  (`ring-stone-900/50`) instead of adding a fill: solid `ring-stone-900` on a
  12px cell reads as a second data colour and competes with the heat scale.
- Mark a single cell by comparing its date key with a precomputed `todayKey`
  rather than a `Date.now()` comparison inside the loop, and keep the marker out
  of `shade()` so the scale stays testable. Explain the marker in the legend, the
  `aria-label` and the tooltip, otherwise it is decoration nobody understands.
- "Follow the configured language" can mean the FORMAT, not the words. Using
  `toLocaleDateString(locale, …)` gives per-language month names, separators and
  ordering with no translation table, which is what was wanted here; keep
  relative labels like "Today" as literals until the whole UI is translated.
- Keep the machine key stable and localize the display: grouping compares and
  `{#each}` keys stay the ISO day, so a language change cannot merge, split or
  reorder day groups. Derive "yesterday" with `setDate(-1)`, not
  `Date.now() - 86400000`, which breaks across DST.
- A relative day label goes stale at midnight. A 60 s tick that only recomputes
  the day keys fixes it without re-grouping the list.
- Do not predict `Intl` output: pt-PT short dates are numeric
  (`22/09/2026`), not `22 set 2026`. Check the three locales before writing a
  plan that claims a specific string.

## Session: Remove a tag from a note (task 014)
- A button cannot live inside an `<a>`: wrap the chip in a `span.group` with the
  link plus the × button as siblings. Reveal it with `group-hover:opacity-100`
  plus `focus-visible:opacity-100`, otherwise the control is keyboard-invisible.
- Model a single-relation change as its own sub-resource
  (`DELETE /api/notes/[id]/tags/[tag]`) instead of another field on the note
  PATCH. Tags are not part of the text, the FTS row or the embedding, so the
  operation must not be able to touch them by accident.
- Normalise the tag on the way in (trim + lowercase) exactly as
  `setNoteTags` stores it, otherwise a chip click with a different case 404s.
- If a tag page passes its own tag to a removal handler, the note must leave the
  filtered list; check the remaining tags and fall back to `pager.remove(id)`.
- INCIDENT: after a Vite module reload re-evaluated db.ts, the dev server
  returned 500 on every database request with `SqliteError: disk I/O error` at the
  `journal_mode` pragma, while a separate process opened the same file fine
  (`integrity_check: ok`, empty `-wal`). The old orphaned connection wedged the
  process. Restarting the dev server fixed it and no data was at risk. When a
  pragma on a healthy file throws, suspect the process, not the database, and
  verify the file from a second connection before doing anything destructive.

## Session: Download without navigating (task 015)
- SvelteKit already ignores same-origin `<a download>` links: `get_link_info`
  sets `download` only when the origin matches and the attribute is present
  (`utils.js:150`), and the click handler returns early on it (`client.js:2742`).
  So "the SPA router navigated" is not the explanation for a reloading download.
- iOS Safari ignores `download` on a same-origin URL often enough to turn the tap
  into a real navigation. The reliable pattern is fetch → `blob()` →
  `URL.createObjectURL` → click an anchor with the filename.
- When injecting that anchor, append it to the DOM (Firefox ignores clicks on
  detached nodes) and add a `stopPropagation` click listener, or SvelteKit's
  document-level handler intercepts the synthetic click too.
- Exclude the runtime data directory from the dev watcher
  (`server.watch.ignored: ['**/data/**']`). The SQLite files live in the project,
  so every note write is a file change the dev server does not need to care about.
- Changing `vite.config.ts` restarts the dev server. A vanished log file is
  normal after a reboot or a cleanup; check for the process before assuming the
  app is broken, and verify the database from a second connection first.

## Session: Draft survives navigation (task 016)
- Any client-side navigation unmounts the page and drops its `$state`. A
  composer's unsaved text therefore needs to live outside the page component.
- `sessionStorage` is the right store for a per-tab draft: it survives SPA
  navigation and a full reload, and dies with the tab. A module-level `$state`
  store is simpler but is lost on reload.
- Restore in the mount `$effect`, write on every keystroke through the existing
  `onText` / `onQuestion` callbacks, and clear on a successful save. Do not
  clear on navigation — that is the whole point.
- The composer needed no change: it already sends every keystroke up to the
  page, so the draft store only had to be wired into the page's callbacks.

## Session: Layout consistency (task 017)
- When unifying widths, standardise on the width the majority already uses, not
  on the one outlier. Four of five containers were `max-w-2xl`; I widened the
  majority to the outlier's `max-w-5xl` and left the composer behind, which made
  the bar narrower than the page. The user rejected it immediately.
- A fixed bottom bar must match the page width, or the layout reads as broken.
  Check the bar against the page after any width change.
- A data-dense view (the 53-column heatmap) should scroll inside its container
  rather than dictate the page width. `overflow-x-auto` already existed.
- Document the system in `docs/DESIGN.md` and link it from `AGENTS.md` next to
  the other doc pointers, so the next width change starts from the document
  instead of from memory.
- Verify widths by grepping the rendered HTML for the container class, not by
  reading the source: the tag page still had `max-w-5xl` after I thought I had
  changed it, and only the SSR output revealed it.

## Session: Tauri plan and the web regression baseline (task 018)
- **Passing any option to `sveltekit()` makes the plugin ignore
  `svelte.config.js` entirely.** `vite.config.ts` passed `compilerOptions`
  inline, so the `kit.adapter` in `svelte.config.js` was never read. The dev
  server did not care — adapters are not needed in dev — so the app looked
  healthy, but `pnpm run build` printed "No adapter specified" and wrote
  nothing to `build/`. The repo has never had a deployable production build.
  A green `pnpm run build` is not proof that a build exists: check that
  `build/index.js` is actually there.
- **The inline options are flat, not nested under `kit`.** `split_config()`
  keeps only the keys listed in `kit_options`, which are the *contents* of
  `kit` (`adapter, alias, appDir, csp, csrf, embedded, env, experimental,
  files, inlineStyleThreshold, moduleExtensions, outDir, output, paths,
  prerender, router, serviceWorker, typescript, version`). Passing
  `kit: { adapter }` puts the wrapper through to vite-plugin-svelte and drops
  the adapter with no error at all. Passing `adapter` directly works. I hit
  this because I assumed the nested shape, and only reading
  `node_modules/@sveltejs/kit/src/core/config/options.js` settled it.
- **"SQLite" is not one thing.** The system `sqlite3` CLI on this machine has
  no FTS5 at all: `select count(*) from notes_fts` fails with `no such module:
  fts5`. better-sqlite3 bundles its own build, which is why the app works. The
  gate for a WebAssembly engine is therefore not "does FTS5 exist" but "does
  this exact DDL execute", porter tokenizer included:
  `CREATE VIRTUAL TABLE notes_fts USING fts5(content, note_id UNINDEXED, tokenize = 'porter unicode61')`.
- `notes_fts` is a standalone virtual table with **no triggers**; application
  code maintains it. That is why a dropped `DELETE FROM notes_fts` during the
  import rewrite left stale search hits, and why any new mutation path has to
  assert `count(notes_fts) == count(notes)`.
- A golden file must be built from a **frozen synthetic fixture**, not from
  `data/fermentario.db`. The real database is unstable (every new note changes
  the golden and hides a real regression) and it would put personal journal
  text into every diff.
- **Mask volatile values once, at serialization time, not when recording.**
  Masking inside the request helper left `updated_at` unmasked, because the
  value only becomes known as runtime *after* the response that carried it. The
  temp directory also leaked in through `/api/status`'s `modelCache`.
- A regression test that dies with a `TypeError` instead of reporting the bad
  response is not a test. Assert the shape at each step and print what was
  recorded before exiting.
- `GET /api/notes` fires `ensureIndexed()` and `ensureTags()` in the background,
  and both call transformers.js, which downloads weights when the cache is
  empty. A test against an empty cache silently pulls 22 MB per run. A
  test-only `--import` guard that rejects the Hugging Face hosts is enough; the
  routes already swallow those failures.
- SvelteKit rejects a form POST whose `origin` does not match, so the import
  test has to send one. That protection is worth keeping — satisfy it in the
  test rather than disable it.
- The app already renders an empty shell: no note text and no tag name appear in
  the HTML of `/`, `/heatmap` or `/tags/<tag>`. Verified, not assumed. It means
  moving to SPA mode cannot regress the web app's visible output, and it means
  only a real browser test can cover those pages, because a status-200 curl
  cannot see a `load` function that now runs in the browser.
- This directory is not a git repository, so "the diff is empty" is not an
  available acceptance criterion. Use a `shasum` of the files that must not
  change.
- `tauri init` did **not** add `@tauri-apps/api` or `@tauri-apps/cli` to
  `package.json`, and left `identifier: "com.tauri.dev"` in `tauri.conf.json`
  and `name = "app"` in `Cargo.toml`. Check what a scaffolding tool actually
  wrote instead of assuming it did the whole job.
- `tauri init` flag names: `-A` is app-name, not `-n`. `-W` window-title,
  `-D` frontend-dist, `-P` dev-url, and `before-dev-command` /
  `before-build-command` have no short form.
- adapter-static writes to the `pages` option, which defaults to `build`. It is
  settable, so `pages: 'dist-static'` keeps the Tauri build from clobbering
  adapter-node's `build/`. The kit-level `outDir` needs separating too
  (`.svelte-kit/output-static`), or the two builds share one intermediate
  directory.
- `csr: true` passed flat to `sveltekit()` is enough for SPA mode. The Tauri
  docs say to add `export const ssr = false` to `+layout.ts`, which would touch
  shared source. A real build confirmed `csr: true` produces
  `dist-static/index.html` with no source change at all.
- This machine's `java` on PATH is 1.8, which is too old for Tauri v2 Android.
  Android Studio ships JDK 21 at
  `/Applications/Android Studio.app/Contents/jbr/Contents/Home`; point `JAVA_HOME`
  there instead of installing anything.
- A new page that reads `window`, `navigator` or `document` **at component
  init** 500s on the web app, because the web app still server-renders. Put
  every such read in `onMount`. Watch out for the quiet version of this: Node 24
  has a global `navigator`, so `navigator.hardwareConcurrency` does not throw
  during SSR — it silently renders a wrong value into the server HTML.
- In runes mode a plain `let` is not reactive. A diagnostics page whose rows are
  collected in `onMount` renders empty with a plain array, and pushing to it
  needs `rows = rows` after the push for the template to update.
- `tauri android init` needs a JDK 17 or newer on `JAVA_HOME`. It is not enough
  to have `java` on the PATH, because the default here is 1.8.
- `csr` is a **page option**, not a `kit` config option. `kit_options` does not
  contain it, so `csr: true` passed to `sveltekit()` is forwarded to
  vite-plugin-svelte and rejected with "invalid plugin option `csr` in inline
  config". I claimed it worked because the static build still succeeded — and
  it did, but for the wrong reason: nothing in this app sets `prerender`, so
  adapter-static emitted only the `index.html` fallback, which is a working SPA
  on its own. A green build hid an option that was never applied. Read
  `kit_options` before naming a kit option, and do not trust a build that
  succeeds while warning about an option.
- That accident turned out to be the answer: **SPA mode needs no source change
  at all here.** adapter-static's `fallback: 'index.html'` alone gives the
  Tauri build a client-routed app, so `src/routes/+layout.ts` was not created.
- I then tried the documented `export const ssr = false` and the smoke test
  caught what my earlier "no visible change" claim missed. It changes
  `/tags/<unknown>` from **404 to 200** and strips all server-rendered markup.
  An empty-shell observation is evidence about *content*, not about status codes
  or HTML. Reverted.
- `tauri android dev` **hides a missing client data layer.** The dev server is
  still a SvelteKit server, so it serves the `+server.ts` API routes and the app
  on the device quietly talks to better-sqlite3 in Node. A release build has no
  server at all. Test the Android app with a built APK, never with `android dev`.
- A blank white window in the emulator means the WebView loaded nothing, not
  that the app is broken. The evidence is in logcat: `Tauri/Console` printing
  `File: chrome-error://chromewebdata/`. Two causes here: Vite was bound to
  `[::1]:1420` because `host: host || false` left it false when
  `TAURI_DEV_HOST` was unset, and `localhost:1420` inside an emulator points at
  the emulator. The emulator reaches the host through `10.0.2.2`, so
  `src-tauri/tauri.android.conf.json` sets that dev URL and the dev server binds
  every interface.
- `pnpm test` tests whatever is in `build/`. Running `test:web:update` without
  rebuilding captured a 404 for `/diagnostics` in the golden, because the build
  predated the route. The update script now builds first, and the gate order in
  `AGENTS.md` is explicit.
- A **Tauri debug APK still points at `devUrl`**. It installs and launches
  fine, then shows `Failed to request http://localhost:1420/`. There is no
  `--no-dev` flag on `tauri android build`; the way to get a self-contained
  debug APK is to clear the dev URL in the build config:
  `tauri android build --apk --debug --config '{"build":{"devUrl":null}}'`.
  Always test the Android app that way — a debug APK is otherwise just a
  remote browser pointed at a dev server that is not there.
- An Android emulator reaches the host through `10.0.2.2`, so
  `src-tauri/tauri.android.conf.json` overrides `build.devUrl` to
  `http://10.0.2.2:1420`. A physical device needs it overridden with its LAN
  address on the command line. The Tauri config schema rejects unknown keys, so
  a `"//"` comment inside it fails the build.
- The diagnostics page found a bug in itself the moment it ran: keying the row
  list on `r.label` threw `each_key_duplicate` as soon as the download progress
  callback reported the same label twice, and the whole list stopped rendering.
  A test page that only works when everything is fine is not a diagnostic. Key
  on a counter, and update the progress row in place.
- Measured on a Pixel 9 AVD (Android 16, WebView 133, `wv`): **Tauri present**,
  **WebGPU reports "No available adapters"**, `hardwareConcurrency` 4, storage
  quota 3.5 GB, `getUserMedia` and `MediaRecorder` available, and
  `SpeechRecognition` **is** present — the Android WebView does expose
  `webkitSpeechRecognition`, which contradicts the assumption that dictation
  needs a different route. It still has to be proven to work before relying on
  it.
- **`crossOriginIsolated` is false and `SharedArrayBuffer` is absent** on
  Android, even though `app.security.headers` carries COOP and COEP and the
  Tauri source applies them from a code path that is not desktop-gated
  (`protocol/tauri.rs` reads `config.app.security.headers`). So multithreaded
  WASM is not available on Android and onnxruntime will run single-threaded.
  Treat single-thread as the baseline and measure against it, rather than
  assuming the headers worked because they are in the config.
- **The emulator cannot hold the 488 MB model.** Downloading it inside the WebView
  tripped the Android lowmemorykiller, which killed
  `com.google.android.webview:sandboxed_process0` ("min watermark is breached and
  swap is low"), and the app died with it. The evidence is in logcat, not in the
  app: `WINDOW DIED` for the MainActivity and `Process app.fermentario.journal.debug
  has died`. An emulator is not a phone, but this is a real signal that a 488 MB
  model in a WebView is heavy, and it means the tokens/sec measurement has to
  come from a real device or a smaller model.
- A screenshot of the Android home screen means the app is gone, not that the
  screenshot failed. Check logcat for `has died` before looking for a bug in the
  app.
- **A silent fallback to an empty database cost an hour.** `createWasmDb` caught
  the open failure and quietly used `:memory:`, so every WASM read returned
  nothing and 19 of 26 parity checks "failed" for a reason that had nothing to
  do with the queries. Never fall back to an empty store silently: an empty
  journal that looks like it works is worse than a loud failure.
- **sqlite-wasm in Node has no real filesystem.** Its `unix` VFS is a virtual
  in-memory one, so `new oo1.DB('/tmp/x.db', 'c')` *succeeds* and gives an empty
  database. Files have to come in as bytes.
- **A WAL-mode image cannot be deserialized** into an in-memory connection:
  `sqlite3_deserialize` returns `SQLITE_NOTADB` while header bytes 18/19 are `2`.
  Setting `journal_mode = DELETE` first gets past that, and the documented
  import path (`oo1.OpfsDb.importDb`) is browser-only, so it cannot be tested
  from Node. SQL text sidesteps all of it: it runs identically in both engines,
  which is what `scripts/make-seed.mjs` and the app's export emit.
- **oo1's row API has two traps.** `stmt.get()` needs a preceding `step()` and
  then throws "Column index is out of range"; `stmt.get({})` is what returns the
  current row as an object. `prepare()` takes only the SQL text — binding is a
  separate `stmt.bind(values)` call. And `oo1.DB`, not `oo1.Opener`, is the
  constructor in 3.53.
- **BM25 is floating point, so compare ids and order exactly and scores to a
  tolerance.** The two builds differ in the last digits
  (`-6.245083341991583e-8` against `-6.245083341991625e-8`) with identical
  ordering. A test that demands bit-identical scores fails on nothing.
- A parity test that asserts a note is gone after an edit must search for a word
  from *that* note. Searching for "broken chair" proved nothing, because another
  note legitimately contained it.
- **A full disk cost two hours and faked a bug.** The emulator's data partition hit
  90% with 632 MB free, so `adb install -r` started failing with
  `INSTALL_FAILED_INSUFFICIENT_STORAGE` — and because the install was one step in
  a `&&` chain, it failed *silently*: I spent several rounds "fixing" an APK that
  was never on the device, and read a stale diagnostics page as if it were live.
  Check the exit status of every step, and never let a build-and-install run
  quietly skip the install. A nearly full disk also breaks SQLite persistence on
  its own, which is indistinguishable from a VFS bug.
- `console.log` is not forwarded to logcat on Android under Tauri; `console.error`
  and uncaught exceptions are. For a startup fact that has to be readable from a
  terminal, put it on a page — that is what `/diagnostics` is for.
- The main thread needs the **SAH-pool** OPFS VFS. The default `opfs` VFS requires
  a Web Worker, and on the main thread it hands back a database that reads and
  writes perfectly and forgets everything on the next launch. Install it with
  `sqlite3.opfs.installOpfsSAHPoolVfs()` and open with
  `new oo1.DB(file, 'c', 'opfs-sahpool')`. A silent, total data loss is a bad
  enough failure mode that the chosen backend belongs in `/api/status`.
- **`tauri android run` is the command, not `android build` plus `adb install`.**
  `android run` builds the frontend, builds the APK, installs and launches it on
  the device in production mode from `frontendDist`. `android build` keeps
  pointing a debug APK at `devUrl`, which is why it produced
  `Failed to request http://localhost:1420/` and needed a
  `--config '{"build":{"devUrl":null}}'` override that `android run` never needs.
  The user had to point this out; I had built the right pieces and then assembled
  them by hand.
- `tauri init` leaves four visible starter leftovers, all found only by looking
  at the output rather than the source: `<string name="app_name">"fermentario"</string>`
  with the quotes as literal text (init writes a JSON string into an XML resource),
  `Cargo.toml` with `name = "app"` and `description = "A Tauri App"`, a
  lowercase `productName`, and the Svelte logo left at
  `src/lib/assets/favicon.svg` with `static/` holding no favicon at all.
- A page that does not set its own `<title>` inherits the layout's. The homepage
  was the only route without one; `/heatmap`, `/tags/[tag]` and `/diagnostics`
  each had theirs. Compare the routes against each other instead of checking one.

## Session: v0.1.1 release (version align + first push)
- Versions drift: `package.json` was `0.0.1` while `tauri.conf.json` and
  `Cargo.toml` were `0.1.0`. Bump all three together plus `Cargo.lock`
  (`[[package]] name = "fermentario"`), or the desktop bundle reports a
  different version from the web app.
- `.gitignore` did not cover `/data` or `/.cache`, so `git add -A` staged the
  real `fermentario.db` plus `-wal`/`-shm`. Fix the ignore file before you
  stage, then verify with `git add -A --dry-run | grep -E "data/|\.cache"`.
- Gate order matters: `pnpm run check` (0/0) → `pnpm run build` + verify
  `build/index.js` exists → `pnpm test` (28/28 web, 27/27 parity) → `GET /`
  returns 200. `pnpm test` runs against `build/`, so a stale build tests old
  code.

## Session: Heatmap button loading state
- A plain `<a href>` gives no feedback during SvelteKit client navigation: the
  old page stays mounted while `load()` fetches, so the button must show the
  wait itself. Derive it from `navigating` in `$app/state`
  (`navigating.to?.url.pathname === '/heatmap'`) — verified present in
  `node_modules/@sveltejs/kit/src/runtime/app/state/` on Kit 2.70.3. It sets on
  navigation start and clears on settle or failure, so no manual reset path.
- `<a>` takes no `disabled` attribute. Disable with `aria-disabled="true"` +
  `pointer-events-none opacity-40`, and mark `aria-busy`. Swap the `Grid3x3`
  icon for `LoaderCircle` with `animate-spin` (`h-3.5 w-3.5`, same as
  `Timeline.svelte:211`) — no new spacing, color, or type, so `docs/DESIGN.md`
  stays satisfied.
- SSR renders the idle branch (`navigating.to` is null), so `curl | grep` only
  proves `aria-busy="false"` and no spinner class. The pending branch needs a
  real click test in the browser.

## Session: Tauri removal (web-only)
- `src-tauri/` (65 files), `vite.config.tauri.ts`, `src/hooks.client.ts`,
  `src/lib/platform/local-api.ts`, `wasm-db.ts`, `seed.generated.ts`,
  `scripts/make-seed.mjs`, `parity.ts`, `sqlite-gate.mjs` are gone. Kept:
  `platform/journal.ts` + `sqlite.ts` (the Node server imports them),
  `platform.ts` (`isAppleDevice`), `scripts/seed.ts` (test fixture data).
- Deps removed: `@tauri-apps/api`, `@tauri-apps/cli`,
  `@sveltejs/adapter-static`, `@sqlite.org/sqlite-wasm`. Scripts removed:
  `dev:tauri`, `build:tauri`, `seed`, `test:engine`, `gate:sqlite`.
  `pnpm test` is now the web smoke test only (28 checks).
- `vite.config.ts` lost the dead `__LOCAL_DB__` define. The diagnostics page
  lost the Tauri row, the VFS branch (web `/api/status` never returns
  `database.vfs`), and Android-only copy. Tasks 023/024/025 deleted as
  app-only. Standing rule: never suggest commit or push; the user alone
  orders it.

## Session: sections run 023–033 (all done, web unbroken)
- Eleven tasks in order: sections shell + carousel + `G then 1–5` shortcuts
  (hints in config only, never on pills — modifier chords collide with macOS
  capture), To-Do (groups/items/tags), Principles (positional numbering,
  full-order PUT), Library/Influences placeholders, Featured (flag-only PATCH,
  pinned lists, pager excludes), fullscreen editor (same controlled input),
  tag colors (registry + palette keys + shared store), YouTube id-only column
  + click-to-load embed, single-note route reusing all timeline handlers,
  settings FAB + tabbed modal (old modals deleted).
- Migrations via `PRAGMA table_info` + `ALTER TABLE` in `db.ts` (featured,
  video) — verified against a pre-flag database.
- The smoke "DELETE /api/notes/[id]" steps sent GET (no method arg), so the
  golden held 405s and DELETE was never tested. Fixed to real DELETEs and
  added single-note GET/page checks (31 checks). Same mislabeling exists on
  the two tag-DELETE steps — left alone, golden unchanged there.
- Golden updates (`featured`, `video` fields) recorded only after reading the
  diff; `make-fixture` deletes the committed `-shm`/`-wal` sidecars, restored
  with `git checkout` to keep the change set clean.
- Touch drags (pills, principles) and the Ask/config FAB positions need a real
  device to feel; SSR + gates cannot cover them.
- `{@const}` over `$state` re-reads live inside event handlers: nulling the
  state before consuming its snapshot throws on every button. Capture first,
  clear after — always. (Cost a user-caught bug in the To-Do sheets.)
- Modal motion is centralized: `src/lib/motion.ts` (`BACKDROP_MS 150`,
  `PANEL_MS 180`, `PANEL_Y 24`, `motionMs` zeroes under
  `prefers-reduced-motion`). Every sheet/modal fades its backdrop and flies
  its panel up. Same rule as all client motion: gates cannot see it, confirm
  on device.

## Session: To-Do in-progress + db.ts repair
- `todo_items.in_progress` mirrors the note flag: `PATCH` accepts it,
  `listTodoItems` sorts it first, gold tag in both render spots, migration
  verified against a legacy table missing all three newer columns.
- ERROR CORRECTED: an edit to `db.ts` dropped the `position` backfill block
  and left the file syntactically broken (`export const {` fused into the
  migration `if`). Caught by reading the file, repaired immediately, `check`
  green after. Lesson: after every edit to a migration block, read the
  surrounding lines before running gates — a half-applied edit fails in a
  way `check` reports far from the cause.

## Session: drag gestures, tag-safe editing, principles video
- ERROR CORRECTED: the first drag probe booted `build/index.js` without
  `FERMENTARIO_DATA_DIR`, so it ran against the live database and moved the
  first item of a real To-Do group to the end (a temporary "Drag" test group
  was later removed). Lesson: every test boot of the build MUST set
  `FERMENTARIO_DATA_DIR` to a throwaway directory. No exceptions.
- Drag handlers on a tappable pill broke taps: users could not open a list
  because the UI read every touch as drag intent. Fix: pills open on tap,
  drag starts only from a dedicated grip. On task rows, body drag returned
  with capture moved to the first pointermove — capturing on pointerdown
  retargets the click away from buttons, so taps silently stop working. If a
  drag surface also has tappable children, never capture before movement.
- Trailing-hashtag systems: PATCH re-parses the content, so any edit surface
  that sends text back without the `#tags` wipes them. The task edit modal now
  prefills `(subgroup) text #tags`. The notes edit dialog had the sibling bug:
  it re-sent the stored bare video id, which failed URL validation on any
  text-only edit — prefill the watch URL, not the id.
- Validate side values (like a video URL) before mutating anything in a route:
  a 400 after the INSERT left a phantom principle the client never saw.
- Touch drag from a row body cannot be guaranteed: without `touch-action:
  none` present at touchstart the browser claims the gesture as scroll and
  fires pointercancel. A grip with a static `touch-none` is the reliable
  touch target; body drag is for mouse.

## Session: pill layout, recap button, principles grips
- If a flex child looks vertically off in a one-line card, ask what defines
  the line height: our 32px `h-8` ⋮ button set it, so `items-start` looked
  right for the button and raised everything else. `sm:items-center` +
  removing the mobile-only `mt` nudges on desktop fixed it — no magic `mt`
  arithmetic, and multi-line rows stay consistent (everything centres).
- Prefer spatial merging over absolute positioning for corner pills: an
  absolutely-placed comment pill drifted onto the open thread's Add form.
  `ml-auto` inside the last chips row keeps the pill at the same visual
  spot, adds no line, and wraps away cleanly when the chips fill the row.
- A working-but-invisible affordance is not a feature: principles reorder
  was fully implemented (body drag + PUT) but nobody could find it. If a
  gesture has no visible affordance, add one (the standard grip) before
  assuming the code is missing.
- Playwright target by stable handles: done rows carry no `data-item`
  (drag-only attribute), so row locators must fall back to text/role —
  otherwise a valid flow dead-times at `boundingBox` for 30s.

## Session: comments corrected to the one modal standard
- "Standards" means structural identity, not decoration: tasks and principles
  had the same inline thread but the input was inline too, and one tab rode
  left while the other rode right. The user's rule is absolute — comment
  inputs exist ONLY in a modal, and icons sit in ONE position. When a rule
  gets declared, apply it to every surface at once (including the detail
  page), then sweep the codebase for violators instead of patching tabs one
  by one.
- Function-typed props are the modal's contract, not internal state: the
  shared modal posts/deletes through callbacks so the caller keeps its own
  lists, routes and count bookkeeping. Type the delete callback minimally
  (`{ id: string }`) — the full record only invites re-wiring.
- A shared, structurally broader prop type can silently drop to its
  constraint (Svelte `generics` are flaky in tooling). Inheriting the widest
  real type (`created_at: number`, not `string`) plus `Pick`-free minimal
  handler params avoided generics entirely — plain structural types are the
  portable choice.

## Session: notes fold — invented chevron removed, tap-to-toggle instead
- "Toggle" did not license a new control. The user never asked for a
  chevron; "togglable notes" meant the note text itself toggles (tap to
  fold, tap to expand). Inventing visible chrome for an operation that needs
  none adds a placement problem ("random place" on mobile) and a consistency
  problem (conditional rendering made it appear on some cards, not others —
  it looked like it belonged to featured notes). Default to the content as
  the interaction; ask before adding controls.
- Conditional affordances blur into "arbitrary": a control that exists only
  on multi-line rows reads as random when most rows are single-line. If a
  needed affordance varies by content, tie it to persistent, understandable
  rendering (the `… +N more` hint does that) rather than a floating widget
  in icon columns.
- Verify with anchors that SURVIVE the interaction: a live locator keyed to
  text that folding removes (`hasText: 'Second'`) silently resolves to
  nothing after the click, turning "hint present" into a false fail.
  Anchor to content that stays, or snapshot before acting.
- Seeders must match the real write path: `featured` is set via
  `PATCH /api/notes/[id] {featured: true}`, not the create POST body — a
  silently ignored field produces a note that looks like an app bug (missing
  amber border) but is fixture error.

## Session: fold rewrite — measure rendered lines, trust stored folds
- The fold criterion was `content.split('\n').length > 1` — raw newlines.
  Real notes are mostly paragraphs that WRAP without newlines, so the
  toggle existed only on the few newline-shaped notes (read: the featured
  ones). "Show the first line when split into lines" is a data property;
  "show the first rendered line" is a layout property. Toggleability that
  depends on layout must be measured from layout (height vs line-height
  after paint, re-measured on resize), never inferred from source text.
- Two gestures on one card is ambiguity, not convenience: text = toggle and
  a tiny hour link = open left users guessing where to hit. One card, one
  tap action; everything else (open, edit, copy, delete) belongs to the ⋮
  menu. The user confirmed: open lives in the menu.
- Chromium overflows nothing under `-webkit-line-clamp`: `scrollHeight`
  equals `clientHeight` on the clamped box, so a re-measure keyed on the
  folded element silently un-clamped persisted folds after reload. Trust
  what the user persisted — measure only the unfolded state and re-measure
  on expand.
- Fixtures must contain the real-world shape: past verifications used
  newline-rich notes and passed, while the user's paragraph-shaped notes
  had no toggle at all. Seed the "ordinary" case (plain long paragraph),
  not the convenient one.
- Fitest fields: `featured` is PATCH `/api/notes/[id] {featured:true}` —
  the create POST body silently ignored it.

## Session: fold persistence — one storage key, two mounted timelines
- Per-instance UI state + a shared storage key = last-writer-wins. The home
  page mounts TWO timelines (featured section + history) that can hold the
  same note ids; each kept its own fold map over the SAME
  `localStorage` key, so a fold in one instance silently overwrote the
  folds the other instance had made. When a component can be mounted
  multiple times at once, key-backed state must live at MODULE level (one
  record, loaded once, pruned only by explicit user action) — never
  per-instance.
- Storage loads must not prune: the older version re-parsed storage on
  every notes change and intersected with ids visible to THAT instance,
  dropping folds the instance could not see. Loading is a merge; only an
  explicit undo (expand) deletes.
- Reproduce complaints at the data level, not the demo level: seed the
  user's shapes (featured-note-in-two-lists, paragraph notes) and the
  exact gesture ORDER they did (featured first, then ordinary) — the old
  verifications folded only inside ONE instance and could not see the
  clobber.

## Session: note comments restored — uncommitted work has no archaeology
- "It's not in git" only proves it is not in COMMITS. This session's
  uncommitted branches can rise and die invisibly: a later edit can revert
  earlier uncommitted work and no diff will ever show it. The note comment
  button fell exactly through that hole — I searched committed history for
  the feature, found none, and concluded it never existed; the user (who
  watched it exist) got steamrolled. When a user says a feature used to
  be there, treat it as present-on-demand and REBUILD it rather than
  litigating history.
- One look at what the user can SEE (the comments standard exists for tasks
  and principles with a modal, a pill, API and count bookkeeping) made the
  missing piece obvious by comparison. When a feature feels "removed",
  map its siblings first — the standard IS the spec.
- Fixture tags follow the real write path: `POST /api/notes` takes tags
  ONLY as trailing #hashtags inside the content. A `tags: []` body is
  ignored, which sent a tag-page verification chasing a note that was
  never on that page.

## Session: comments — modal input-only, list on the single page
- The comment modal was redesigned on instruction: it takes text for ONE
  new comment and closes on success; the thread and deletes live only on
  the single item page (`/todo/[id]`, `/notes/[id]`, and the new
  `/principles/[id]`). The pill stays the add entry point everywhere. The
  modal no longer fetches a thread at open — three tabs lose their whole
  comment-cache state (`taskComments`, `commentsByPrinciple`, timeline
  `refreshComments`), which is a net simplification, not a regression.
- "The list lives on the single page" implies the page must EXIST and be
  reachable: principles had neither, so the page was built and the
  principle actions menu got "Open" as its first item. When a rule
  references a destination, check the destination exists before wiring.
- Detail pages need the listed nouns the user names: after this change,
  delete affordances sit per row (`aria-label="Delete comment"`) with the
  danger `ConfirmDialog`, not in the modal.
- The modal header is a LABEL, not data: a "simpler title" means the plain
  action name ("Add comment") — do not carry the item's content into the
  dialog heading. The title prop died with that change; five call sites
  got one line shorter each.
- Verify scripts on a fresh `FERMENTARIO_DATA_DIR` must seed first: the
  empty state renders no list items, no pills, no menus — every locator
  then times out on nothing (and a nonexistent principle id poisons the
  whole run). Seed, then browse.
- A cross-axis `items-start` on a container that becomes
  `max-sm:flex-col` silently stops children from stretching: each child
  shrinks to its content width. Symptom here: short notes rendered the
  note text (and the "bottom-right" pill row) at ~half card width, with
  the pill row landing near the absolute ⋮'s horizontal band — described
  by the user as the add-comments button sitting top-right left of the
  three dots. The fix is one class (`max-sm:w-full` on the inner row).
- Verify responsive layouts with BOTH short and long content: long
  wrapping text fills its column and hides a shrink-to-content bug that
  short text exposes.
- A "top right" complaint can hide a WIDTH bug: the element that looked
  mis-positioned was actually right-aligned inside a too-narrow column.
  Measure the parent's box before moving anything.
- Every card renders TWO count-pill variants (one per breakpoint, one
  hidden by CSS). `.first()` can select the hidden one and time out on
  click — Playwright needs the `:visible` locator
  (`button[aria-label="…"]:visible`) rather than positional picks. A tab
  switcher may also hide section content until its `role="tab"` is
  clicked; verify scripts must drive the visible tab bar.

## Session: Restore every journal table (task 034)
- Export streams the WHOLE database file, so every table is already in a backup.
  Restore must mirror that set. Copying only notes, tags, vectors, recaps and
  asks silently left To-Do groups/items, principles, comments and tag colors
  behind. The mismatch was invisible because the restore "succeeded".
- Copy parents before children and rely on `foreign_keys = ON` for cascades:
  notes own tags/vectors/comments, todo_items own tags/task comments,
  principles own tags/comments. `notes_fts` has no foreign key, so delete and
  rebuild it explicitly.
- Old exports may lack later tables or columns. Inspect the uploaded connection
  with `PRAGMA table_info` and select literal defaults (`0`, `''`) for missing
  columns. Copy a table only when the upload has it; leave live sections
  untouched when the backup cannot represent them.
- A golden result of 403 for `POST /api/import` means the restore path was never
  tested. adapter-node defaults the request origin to `https` when `ORIGIN` is
  unset, so the plain-HTTP smoke test failed CSRF. Set `ORIGIN` to the test base
  and assert the phases plus the restored rows, not only the status.
- Tag colors cache their first fetch in a module-level promise. After a restore
  replaces `tag_colors`, call `reload()`; otherwise the new colors stay hidden
  until a full page reload.
- adapter-node's default `BODY_SIZE_LIMIT` is 512 KB. A real 1.2 MB backup was
  rejected before the import route ran. `scripts/start.mjs` sets 110 MB before
  loading the build; the route still enforces its own 100 MB check. Test the
  restore with a database larger than 512 KB, not only the small fixture.

## Session: Heatmap reverse chronological order
- Reversing only the columns leaves time running forwards inside each column and
  puts month labels at the right edge of their blocks. Reverse the flat day list
  before packing it seven per column, so time runs newest-to-oldest both across
  and down. The short final column stays at the bottom right.

## Session: Global navigation loader
- `navigating` is the only common signal for a route change in flight; a direct
  `goto()` from a card has no callback shared with the other links. One
  `NavigationLoader` in the root layout covers notes, tasks, principles and all
  other client-side routes.
- Delay the pill by ~120 ms so instant navigations do not flash. Keep the
  full-screen backdrop interactive: `pointer-events-none` lets clicks reach
  the composer and other controls below the blurred loading state.
- Changing `node_modules` while the dev server runs can leave SvelteKit's
  module-level `app` undefined; every `goto()` then throws on `app.hash`.
  Restart the server instead of patching the call sites.

## Session: Global loader for data waits
- One `loading.pending` counter in `$lib/loading.svelte.ts` feeds the same
  `NavigationLoader` as route changes. Use `loading.track()` on the fetch of
  each user-triggered load or mutation; nested entries are safe because the
  pill hides only when the counter reaches zero.
- Track the wait, not the work: skip quiet calls such as tag-color loading,
  summary refresh, model polling, `pager.sync()`, diagnostics probes and
  fire-and-forget status writes. Tracking them makes the pill flash while the
  user is not waiting.
- Do not wrap an entire multi-fetch function with one entry unless it can be
  done without touching error paths; separate tracked fetches keep the counter
  above zero through the short gaps between sequential requests.
- `rg` skips `node_modules` by default, so a dependency search can wrongly look
  empty. Use `rg -uu` when checking whether an unfamiliar function comes from a
  package.
- No Svelte code runs before hydration, so the pre-hydration pill must live in
  `app.html`. Keep it outside the app tree and remove it from
  `NavigationLoader`, the component that owns the live pill, so there is no gap
  between the two indicators.
- The 120 ms anti-flash delay hid the initial load on a fast local API: the pill
  never appeared. Show the first tracked wait at once and keep the delay only
  for later waits.
- A reactive counter mutated synchronously inside `$effect` makes the effect
  depend on that counter and retrigger itself: `effect_update_depth_exceeded`.
  Hydration aborted, `NavigationLoader` never mounted, and the static
  `#boot-loader` stayed on screen blocking the whole page. Update the counter
  inside `untrack()`; readers such as `NavigationLoader` still react normally.
- Chromium 152 DevTools throws `reportAllChanges` / `startTime` errors on soft
  navigations from its embedded `web-vitals` copy. The stack has only anonymous
  `VM*` frames. It is a DevTools bug (fixed in Chrome 153), not app code: close
  DevTools or disable `chrome://flags/#soft-navigation-heuristics` to stop it.

## Session: Action feedback, toasts and dictation
- `CommentModal` had a `saving` flag but the button text never changed, so a
  comment POST looked dead. Show `Saving…`, toast on success and an inline error
  on failure; the open modal is the right place for the failure message, so
  callers should only return `false`, never duplicate the error.
- Home, the tag page and all three detail pages each had their own error pill.
  Replace them with one `$lib/toast.svelte` store and a single `<Toasts />` in
  the root layout. Fire toasts only for final action results, not for progress.
- Never assign a prop inside the child. `end: () => { listening = false }` in
  Composer only changed the local prop; after an automatic speech end the
  parent still thought dictation was active. Call `onListen(false)` in `end`,
  `error` and the unmount cleanup.
- A mic that only turns rose is too subtle. Active dictation needs three
  signals: changed icon (`Square` in a filled rose button), motion (pulsing
  ring/dot, disabled under reduced motion) and a text label ("Listening…").
- The timeline hour is a link to `/notes/[id]`; use an `<a href>` so middle
  click and no-JS behavior work. Skip the link while the note is pending.
- Single-item pages show the item's own content in `font-semibold`; comments
  stay normal weight so the page subject is obvious.

## Session: Dark mode
- Tailwind v4 needs `@custom-variant dark (&:where(.dark, .dark *));`. The
  `dark` class on `<html>` must be set by an inline script in `app.html` before
  the first paint; doing it only after hydration flashes the light page.
- Persist the choice as one more key in `fermentario.config`. `saveConfig`
  merges partials, so changing language or width must not drop the theme.
- An automated class rewrite missed color utilities that carry opacity:
  `bg-white/95` stayed white in dark mode while body text turned near-white.
  The composer and inputs looked empty. Grep explicitly for `bg-white/`, and
  test inputs and textareas in dark mode, not only cards and headings.
- Use `bg-stone-700` for primary buttons in dark mode, not `stone-800`. On
  `stone-900` modal panels a `stone-800` button looks disabled; `stone-700`
  keeps the action visible while `text-white` stays legible.
- The loading backdrop is glassy and blocks pointer input while visible. The
  blur and tint show that work is in progress; they must not become a
  click-through layer over the page.
- Verify dark mode with a real browser screenshot, not only by checking that
  `dark:` classes exist in the built CSS. The missed composer class built fine.
- A full-screen note editor, modals and the fixed bottom bar are separate
  surfaces. Check each one: a transparent textarea inherits the body text color,
  so its parent bar must also have a dark background.

## Session: Full-screen text dialogs
- Long note and comment drafts need a full-screen option on mobile. Put the
  toggle in the dialog header, left of Close, with `Maximize2` / `Minimize2`,
  `aria-pressed`, and a label that changes to "Exit full screen".
- Expanded, use `h-dvh` plus `max-w-full rounded-none` on the panel so it
  covers the viewport. Keep the writing column readable on desktop with an inner
  `mx-auto max-w-2xl` wrapper; do not stretch text across the whole monitor.
- A growing textarea needs a flex column on every ancestor: panel, inner wrapper
  and form get `min-h-0`, and the textarea gets `flex-1`. Without `min-h-0` the
  textarea keeps its intrinsic height and pushes the actions off screen.
- Keep the textarea in the same DOM branch when toggling. Reusing the element
  preserves the draft, the cursor and the scroll position; collapsing returns
  to the original `max-w-md` / `max-w-sm` panel.
- `Escape` must collapse the expanded panel before it closes the dialog, so a
  long draft does not vanish on the first key press.
- Animate the expansion with CSS, not by remounting the panel: transition
  `height`, `max-width` and `border-radius`, and animate the backdrop padding
  from `p-4` to `p-0`. Use `max-w-full`, never `max-w-none`: `none` cannot
  interpolate, so the width would snap. Add `[interpolate-size:allow-keywords]`
  to animate `height` between `auto` and `dvh`. Add
  `motion-reduce:transition-none`.
- Give the transition 200 ms and `ease-out`. A longer expansion feels sluggish;
  a shorter one looks like a snap. Test the panel rectangle at 0, 100 and 200 ms,
  not only the end states.

## Session: Editing comments
- Comments were read-only by design. Editing needs a `PATCH` route on each
  existing `[commentId]` endpoint, a DB update scoped by both parent id and
  comment id, and the same edit affordance on every surface that lists
  comments (notes, tasks, principles). Do not add editing to only one detail
  page.
- Reuse `CommentModal` for edit instead of a second dialog: pass `initial`,
  `title`, `placeholder`, `submitLabel` and `successMessage`. The add call
  sites use the same `onSubmit` prop, so there is one submit path.
- Keep `created_at` unchanged on edit. The comment timeline sorts by that
  field; rewriting it would move an edited comment to the bottom.
- The three detail pages repeated the same comment-row markup. A shared
  `CommentItem` keeps the date, pencil, delete and dark styles identical and
  makes the edit affordance impossible to miss on a later surface.

## Session: Done-task history
- Completed tasks need a cursor on `(done_at, id)`, not `updated_at` or
  `created_at`. Editing a done task changes `updated_at`; completing it stamps
  `done_at`, and that is the order the history promises.
- An IntersectionObserver sentinel fires only when the intersection changes.
  Append a page while the sentinel is still visible and a one-shot observer
  goes quiet. Reconnect the observer after `loadingMore` returns to false so a
  short first page keeps filling the viewport.
- The sentinel is invisible (`h-1`), so the observer preloads with a
  `rootMargin` before the literal bottom of the page. Without margin the user
  sees the list stop before the next request starts.
- Confirmation belongs only on the open → done transition. Unmarking restores
  an open task and does not need a dialog; confirming both directions makes
  routine cleanup noisy.

## Session: Animated note folds
- CSS `line-clamp` cannot animate between one line and full content. Keep the
  content unclamped during the height transition and apply the clamp again only
  after the collapse transition ends.
- Capture the wrapper height before changing state. Set the starting
  `max-height`, wait for `tick()`, force a layout read, then set the target
  height so the browser starts the transition.
- Clear the temporary `max-height` and unclamped flag on `transitionend`. With
  reduced motion, skip the transition and clear them immediately; otherwise the
  stale `max-height` can survive.

## Session: mobile note fold — WebKit does not clamp a button
- The note text is a `<button>` with `line-clamp-1`. WebKit 26 applies the
  clamp classes but keeps the button's full layout height (220 px at 390×844);
  Blink clamps the same button to 21 px. The animated fold's cleanup removed
  the temporary `max-height` and relied on the clamp, so the note contracted
  and then jumped back to full height. One tap produced one click; the state
  and localStorage were correct. The layout was wrong.
- Put the clamp on an inner `<span>` inside the button. The span clamps to
  20 px in WebKit and 21 px in Chromium. Keep the button for click/keyboard
  semantics and `aria-expanded`.
- Do not put `line-clamp-1` and `block` on the same element: Tailwind's `.block`
  can override `display: -webkit-box` and the clamp silently stops working.
- Chrome mobile emulation passed and hid this bug. Reproduce WebKit/CSS
  failures in Playwright WebKit; the engine, not the viewport, was the variable.

## Session: Per-user journals and onboarding
- A database opened at module load cannot support "no journal". Move the open
  behind a lazy `getJournal()` and keep the old named query exports as thin
  delegates, otherwise every API route has to be rewritten at the same time.
- Store journal metadata in a separate `registry.db`. Do not treat the folder
  name as state: the path is relative to `data/`, must be checked for `..`, and
  the active id belongs in one place.
- Copy a live SQLite database with `VACUUM INTO`, not `copyFile`. In WAL mode the
  newest rows can still be in `-wal`; `VACUUM INTO` writes one consistent file.
  Use the same operation for the pre-migration backup.
- Import the old file into a new path, validate it, and only then register and
  activate it. Delete the old file last. If any step fails, remove the new
  directory and leave the source untouched; `/journal-error` is safer than
  onboarding over data.
- Do not redirect a missing or broken active journal to `/welcome`. The error
  screen has retry and restore; the welcome screen has create, which could hide
  the user's existing file.
- Track migrations per journal in `schema_migrations`. Version 1 is the full
  baseline, including the column checks and backfills from the old startup code.
  `PRAGMA user_version` is a compatibility hint, not the history.
- Each migration and its tracking row must commit together. A backup must be
  written before the first pending migration, not after a failed one.
- The migration runner is also a CLI. Node's strip-only TypeScript loader does
  not support constructor parameter properties, so write the explicit fields.
  Relative TypeScript imports need the `.ts` extension for Node; the Svelte
  build still handles them.
- `ReadableStream` SSE routes keep running after the client disconnects. Put
  temp-file cleanup and the onboarding lock release in `finally`, and guard
  `controller.enqueue`/`close` with try/catch.
- Test first boot with a throwaway data directory. The web smoke fixture is
  deliberately pre-migration; asserting that `fermentario.db` is gone after the
  first request catches a silent fallback to the old path.

## Session: Restore validation + hidden weekly recap
- An always-enabled "Restore…" button plus a post-click inline error reads as
  "restore runs with no file". Track the chosen `File` in `$state` from the
  input's `onchange`, validate the extension and an empty file there, and
  `disabled={!selected}` the button. `accept=` is a picker hint, not validation.
- `runRestore()` called `refreshSummaryAnswer(true, null, true)`. The first
  `true` forced `rf=1` (a full recap regeneration even though the import already
  copied `weekly_recaps`); the last `true` set `summaryLoading`, which shows
  "Building your weekly recap…" in the timeline and re-opens the hidden weekly
  card via `dismissed = false`. Refresh silently with `(false, null, false)` and
  clear `week`/`dismissed` before the import.
- A summary request can outlive the journal it started on. `resetSummaryCache()`
  alone is not enough: the in-flight task still reaches `saveWeeklyRecap()` and
  writes the old recap into the restored rows. Guard the write with the
  `getSummaryEpoch()` captured at request start, the same pattern as `rag.ts`
  and `tags.ts`.
- Guard the client too: bump a summary epoch and drop responses from before the
  restore, or an old recap lands in `week` after the new data is loaded.

## Session: Inline edit on the single note page
- Task 032 asked for "inline edit" but the page reused `EditNoteDialog`, so the
  note text stayed bold behind a backdrop. Edit now swaps the `<p>` for a
  textarea in the same card; Save/Cancel sit below it. Keep `EditNoteDialog` for
  the timeline.
- Prefill the video field with `youTubeWatchUrl(note.video)`, not the stored id.
  The dialog's `unchanged` check already compared the URL form, so the id made a
  no-op save look dirty.
- An inline editor needs a controlled textarea plus a mount action: focus, put
  the caret at the end, and set `height = scrollHeight`. Autosize again on every
  input; `max-h-[50dvh]` turns a long note into an inner scroll instead of a
  page jump.
- Hide the ⋮ button, tags and the video pill while editing. They act on the
  stored note and would compete with the fields.

## Session: Global search palette
- `Cmd/Ctrl+K` is free: the home page's `handleViewShortcut` returns for any
  Cmd/Ctrl chord without Shift, so the global handler can claim it. Keep the
  `isComposing` guard; the composer and the palette input both accept IME text.
- Mount the palette in the root layout, not the home page. The shortcut must
  work on note, task and principle detail pages, while the pill stays in the
  home header. One `<svelte:window>` handler in the layout owns the shortcut.
- A `placeholder` attribute cannot render the `Kbd` component. Put the shortcut
  chip at the right edge of the field and keep `aria-keyshortcuts` on the pill.
  `Kbd` is `hidden sm:inline-flex`, so hide the pill label on phones too or the
  header wraps.
- Search notes, tasks and principles with one `LIKE ... ESCAPE '!'` model
  instead of `notes_fts`. The other two tables have no FTS, and FTS ignores
  tokens shorter than three characters, so a mixed model would change behaviour
  per kind. Escape `!`, `%` and `_` in the user text; otherwise they act as
  wildcards. The FTS index stays for RAG.
- The palette's open/close effect resets the query, moves focus to the input and
  restores the previous focus on close. An effect that fetches must abort its
  `AbortController` in the cleanup, or a slow response from the previous query
  can land after the user changed the text.

## Session: Tag cloud index
- Count tags from the three membership tables, never from `tag_colors`. A color
  outlives its items, so using the registry as a source would show orphan tags.
- `/tags` and `/tags/[tag]` coexist: SvelteKit picks the exact static page for
  `/tags` and the dynamic page for a tag. No route conflict.
- Do not add `/api/tags/cloud`: a real tag named `cloud` would collide with the
  color `PUT /api/tags/[tag]` route. Use `/api/tag-cloud`.
- Do not scale tag-cloud pills by use count. The user wants frequency to change
  order only: sort `count DESC, tag ASC`, keep one pill size, and let the count
  badge carry the exact number. `$lib/tag-cloud.ts` now holds only the
  `TagCount` type.
- Do not hardcode the tag-detail back link to `/`. A tag detail opens both from
  `/tags` and from tag chips on notes, to-dos and principles. Use
  `history.back()`, with `/tags` as the no-history fallback. The fixed link sent
  the tag-cloud path back to notes.
- `ConfirmDialog` has three tones: danger, success, and neutral. Completion uses
  success green because it is a positive state change; moves stay neutral, and
  deletion stays danger.

## Session: Note edit keeps tags
- A note's trailing hashtags live in `note_tags`, not `note.content`. `PATCH
  /api/notes/[id]` clears and re-parses those tags from the submitted text, so
  any note editor that sends the bare body back drops them. The single note
  editor and the timeline dialog now prefill
  `withTrailingHashtags(note.content, note.tags)`, the same pattern
  `TodoTab.openEdit()` uses. Compare the "unchanged" state against that
  reconstructed text, not against `note.content`, or Save stays enabled.
- Do not append a multi-word tag as `#short phrase`: the parser stores
  `phrase` and leaves `short` in the body. `withTrailingHashtags()` appends
  nothing when any tag fails the one-token grammar.
- The inline editor's empty check must use
  `splitTrailingHashtags(text).content`, otherwise a textarea holding only
  `#tags` passes the check and the API rejects it as an empty note.

## Session: Principles date + add shortcut
- Principles already carried `created_at`; the list simply never rendered it.
  Show it under the text with a `<time>` element (`dayLocale(lang)`), and keep
  the full timestamp in `title`. The detail page already showed the full date.
- Reuse the To-Do Add shortcut (`⌘⇧A` / `Ctrl+Shift+A`) on the Principles Add
  button. Keep the same guards: fine pointer, no editable target, no open
  modal, no composing. Add the `Kbd` to the button and `aria-keyshortcuts`;
  the hint is `hidden sm:inline-flex`.
- Reset the video draft when opening the add modal, not only the text.

## Session: Modal backdrop blur
- Every modal overlay copies the loading state's `backdrop-blur-md`; keep the
  existing overlay colors and padding. The opaque fullscreen `Composer` has no
  visible backdrop, so it is not part of this rule.
- Apply the blur to the overlay element, not the panel. A `backdrop-filter`
  creates a containing block for fixed descendants, so keep the panel inside the
  overlay's grid/flex layout instead of adding fixed positioning to it.

## Session: AI tagging removed
- AI tagging had three entry points, and removing only the POST fallback is not
  enough: `GET /api/notes` ran `ensureTags()` over notes missing tags, and
  `PATCH /api/notes/[id]` ran `tagNote()` after every edit without a hashtag.
  The PATCH path is the one that re-created a tag right after the user deleted
  one.
- Tags now come only from trailing hashtags typed by the user. Published notes
  without hashtags stay untagged; editing a note without hashtags clears its
  tags. `src/lib/server/tags.ts`, `notesMissingTags` and the tagger prompts are
  gone. Keep `chat()`: Ask and the weekly summary still need it.
- Keep `ensureIndexed()`: RAG embeddings are separate from tags.
