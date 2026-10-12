Status: [TODO]

# Model distribution on the device

## Context
- The model cache on this machine is 3.9 GB: the embedder 109 MB on disk and 22 MB quantized, Qwen2.5-0.5B int8 488 MB, Qwen2.5-1.5B int8 1.5 GB.
- Only the embedder can be bundled. Google Play caps a base download near 200 MB, so 488 MB must be fetched on first run. The 1.5B is not a candidate for a phone.
- The embedder is what makes search work, so bundling it is what makes the app useful offline the moment it is installed. A phone app that needs the network before it can search is a worse journal than the web app it replaces.
- After the first run, `allowRemoteModels` is set to false, so a missing file fails immediately instead of hanging on a network call.
- `@huggingface/transformers@4.3.0` resolves its `default` export to `transformers.web.js`, so the model code is already isomorphic. Nothing in `models.ts` needs rewriting for the browser; the storage location does.

## Requirements
1. The quantized embedder ships as a Tauri resource and is loaded from the filesystem, with no network request on first launch.
2. The chat model is downloaded on demand, into app data, with progress in the existing Models modal. The download is resumable and survives a force-quit and reopen.
3. `allowRemoteModels = false` once both models are present.
4. The download reports a failure as a failure. The status route already distinguishes "requires download" from "error", and that distinction must survive.

## Acceptance criteria
- With the device in airplane mode, a fresh install can save a note and find it again.
- The chat model reaches 100% and is still marked downloaded after a force-quit and reopen.
- The Models modal shows the same progress states as the web app.
- `node scripts/web-smoke.mjs` reports no differences.

## Progress
