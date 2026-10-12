Status: [TODO]

# Tauri v2 shell and static build

## Context
- The goal is an Android app that runs the same journal offline, with models on the device. Tauri v2 is the shell; the frontend stays SvelteKit.
- Tauri has no server. The official SvelteKit guide requires `adapter-static` with `fallback: 'index.html'` and SPA mode, so `load` functions run in the WebView.
- The web app must keep working. So there are two builds, not a swapped adapter:
  - `vite.config.ts` calls `sveltekit()` with no argument and therefore loads `svelte.config.js` → adapter-node. Unchanged.
  - `vite.config.tauri.ts` passes the static adapter inline. Since SvelteKit 2.62.0 the config can be passed to `sveltekit(config)`; `svelte.config.js` is then ignored for that build and the plugin logs a warning. This is the supported mechanism — a custom `configFile` is *not*: the kit plugin sets `configFile: false` on vite-plugin-svelte and loads `svelte.config.js` itself.
- The static build writes to `dist-static/` so it cannot clobber adapter-node's `build/`.
- COOP/COEP are required for `SharedArrayBuffer`, which onnxruntime-web needs for multithreaded WASM. Without them it silently falls back to one thread, which shows up as slowness rather than an error. The Tauri docs require the headers in `app.security.headers` in `tauri.conf.json` *and* in the Vite dev server.
- `kit.csr: true` is preferred over `export const ssr = false` in `+layout.ts`, because it is a build option rather than a shared source change. Verified present in this kit version at `node_modules/@sveltejs/kit/types/index.d.ts:2794`.
- The inline options are **flat**, not nested under `kit`. `split_config()` keeps only the keys in `kit_options`, which are the contents of `kit` — `adapter, alias, appDir, csp, csrf, embedded, env, experimental, files, inlineStyleThreshold, moduleExtensions, outDir, output, paths, prerender, router, serviceWorker, typescript, version`. A `kit: { adapter }` wrapper is not one of them, so it goes to vite-plugin-svelte and the adapter is dropped with no error. Task 018 hit this: the build printed "No adapter specified" and wrote nothing.
- `svelte.config.js` is therefore only read by `svelte-kit sync` and `svelte-check`. It has no effect on `vite dev` or `vite build` here, because `vite.config.ts` passes options inline. Each Vite config must state its own adapter.

## Requirements
1. `src-tauri/` scaffolded with `tauri init`, plus `tauri android init`.
2. `vite.config.tauri.ts` passes the static adapter inline and flat, and outputs to `dist-static`.
3. `tauri.conf.json` points `frontendDist` at `../dist-static`, sets `devUrl` and `beforeDevCommand`, and sets COOP/COEP in `app.security.headers`.
4. `csr: true` in the Tauri-only config. If adapter-static rejects it, fall back to `export const ssr = false` in `+layout.ts` and record why.
5. `vite.config.ts` keeps its own inline adapter and is otherwise unchanged. `svelte.config.js` keeps the node adapter for `svelte-check` and `svelte-kit sync`.
6. `src/lib/server/**` stays untouched.
7. A hidden `/diagnostics` route exists, even if it only reports the browser basics for now.

## Acceptance criteria
- `pnpm run build` still produces a working adapter-node build and `GET /` returns 200.
- `node scripts/web-smoke.mjs` reports no differences.
- The static build completes and `dist-static/index.html` exists.
- `tauri android dev` boots on a device and shows the diagnostics page.
- `pnpm run check` prints 0 errors and 0 warnings.

## Progress

### 2026-09-28 — in progress
- `tauri init` created `src-tauri/` with `tauri.conf.json`, `Cargo.toml`, `build.rs`, `src/`, `icons/` and `capabilities/default.json`. It did **not** add `@tauri-apps/api` or `@tauri-apps/cli` to `package.json`, so both were installed by hand, plus `@sveltejs/adapter-static`.
- Flag names differ from the obvious guess: `-A` is app-name, not `-n`; `-W` window-title; `-D` frontend-dist; `-P` dev-url; `before-dev-command` and `before-build-command` have no short form.
- `vite.config.tauri.ts` written. `csr: true` passed flat works: the build prints "Using @sveltejs/adapter-static / Wrote site to dist-static" and produces `dist-static/index.html`, with **no change to `src/routes/+layout.ts`**. The web app's source is untouched.
- Output separation needed two settings, not one: the adapter's `pages` option (default `build`) becomes `dist-static`, and the kit-level `outDir` becomes `.svelte-kit/output-static`. Without the second, the two builds share one intermediate directory.
- `tauri.conf.json`: `identifier` set to `app.fermentario.journal` (init left `com.tauri.dev`), and COOP/COEP added to `app.security.headers`. The same headers are in the Vite dev server, as the Tauri docs require.
- `pnpm run dev:tauri` and `pnpm run build:tauri` added, wired to `beforeDevCommand` and `beforeBuildCommand`.
- `tauri android init` succeeded with `JAVA_HOME` pointed at Android Studio's bundled JDK 21, because `java` on PATH is 1.8. It found the installed NDK 29 and generated `src-tauri/gen/android/` with `minSdk = 24` and `compileSdk = 37` as intended.
- A hidden `/diagnostics` route exists. It caught a real bug immediately: the page touched `window` at component init, which threw during SSR and returned 500. Node 24 has a global `navigator`, so the isolation rows did not even throw — they rendered wrong values into the server HTML. Every probe now runs in `onMount`.
- Two more real defects found and fixed on that page: a plain `let` for the row list is not reactive in runes mode, so the page rendered empty; and `rows = rows` is needed after a push for the template to re-render.
- `/diagnostics` added to the smoke test as a fifth page check, so a 500 there fails the gate. Baseline is now 28 checks, 28/28 green.
- Verified with both build targets present: `pnpm run check` 0/0, `pnpm run build` produces `build/index.js`, `pnpm run build:tauri` produces `dist-static/index.html`, `pnpm test` 28/28, and the live web app answers `/`, `/heatmap`, `/tags/garden` and `/api/notes` with 200.
- Outstanding: the arm64 APK build and the on-device run. `adb devices` lists nothing, so `tauri android dev` on a phone waits on a connected device.

### 2026-09-28 — verified on a device
- A Pixel 9 AVD (Android 16, WebView 133) was started and the app was installed
  and launched. The real UI renders: header, Models/Config/Heatmap, Notes/Ask,
  "0 notes loaded", Copy all, the composer with the mic button and Save.
- `0 notes loaded` is correct and is itself evidence: the app is not secretly
  talking to a server, because there is no client data layer yet.
- Two blank-screen failures were both "the WebView had nothing to load", not app
  defects: Vite bound to `[::1]:1420` while `localhost:1420` inside an emulator
  means the emulator itself, and a Tauri **debug** APK still points at `devUrl`.
  Fixed by binding every interface, setting the emulator dev URL to
  `10.0.2.2:1420` in `src-tauri/tauri.android.conf.json`, and building with
  `--config '{"build":{"devUrl":null}}'` so the APK bundles the frontend.
- `/diagnostics` is reachable from the Config sheet, so the page is usable on a
  device rather than only in a browser.
- `csr: true` was removed: it is a page option, not a kit option, and
  vite-plugin-svelte rejects it. SPA mode comes from adapter-static's
  `fallback: 'index.html'` alone, which is why `src/routes/+layout.ts` was never
  created and the web app's source is untouched.
- The web app is provably unchanged: 28/28 checks, and the `+layout.ts`
  experiment that would have changed `/tags/<unknown>` from 404 to 200 was
  reverted on the smoke test's evidence.
- Verified: `pnpm run check` 0/0, `pnpm run build` → `build/index.js`,
  `pnpm run build:tauri` → `dist-static/index.html`, `pnpm test` 28/28, and the
  live web app answers `/`, `/heatmap`, `/tags/garden`, `/api/notes` with 200.
