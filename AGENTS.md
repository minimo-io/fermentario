# General Guidelines

## Style
- Use ASD-STE100 Simplified Technical English (STE) for your answers.
- Be succinct: Answer directly. Skip greetings, sign-offs, restating the request, and narrative walkthroughs of what you did. Give the shortest explanation that fully answers unless I ask for more detail. This applies to prose only; code, commands, and data output aren't trimmed for length.
- Active voice. Address the reader directly ("you").
- Keep necessary technical terms, but explain them briefly on first use.
- State actions, constraints, scope, and expected results explicitly.
- Cut filler, hedging, jargon, and repetition.
- If precision and natural phrasing conflict, precision wins.

## Process
- Never suggest to commit or push. The user alone gives that order.
- After every change, all four gates must pass **in this order**: `pnpm run check` (0 errors, 0 warnings), `pnpm run build` (clean, and `build/index.js` actually exists), `pnpm test` (the web smoke test, 28 checks against `tests/baseline/web.json`), and `GET /` returning 200.
- `pnpm test` tests whatever is in `build/`, so it must run after `pnpm run build`. Testing a stale build records the old behaviour instead of the current one — that mistake put a 404 for `/diagnostics` into the golden.
- `pnpm test` is the "the web app still works exactly as before" gate. It boots the production build against a frozen synthetic fixture in a temp directory, so it never touches `data/fermentario.db`. Run it after any change to `src/routes/api`, `src/lib/server`, or the page components. To record an intended behaviour change, run `pnpm run test:web:update` and read the diff.
- A green build is not proof that a build exists. Check the output file, not only the exit code.
- At the end of every important task, or upon making an error and correcting it, you MUST update the `docs/lessons-learned.md` file.
- If you create a new tool like, for example, `yt-search.mjs`, document it in a `docs/TOOLS.md` file.
- Layout and design decisions live in `docs/DESIGN.md`. Consult it before changing page widths, spacing, colors, typography or component sizes.
- New skills go into `.agents`, not `.opencode` and not `.claude`.
- Avoid assuming things as much as possible (while still being effective); when in doubt, verify or ask. Especially on important implementations.
- Read the installed source before asserting how a dependency behaves. `node_modules/@sveltejs/kit/src/core/config/options.js` settled a question that three wrong assumptions could not.
- If you have trouble solving a problem, check `docs/lessons-learned.md`.
- Never run any destructive action (`git reset --hard`, `git clean`, force-push, deleting files or branches, dropping changes) without asking the user first.
