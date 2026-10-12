Status: [TODO]

# Diagnostics page and the on-device gate

## Context
- Four unknowns can invalidate the port, and none of them can be answered from this machine: tokens per second on a real phone, WebGPU availability, whether `SharedArrayBuffer` really works under the Tauri protocol, and whether the Android WebView exposes any speech API.
- Guessing produces a plan that fails late. A diagnostics page produces numbers on the first try, and it stays in the app as a support tool, so a future bug report starts with data.
- This is the spike from the original plan, restructured to land after the scaffold, because the shell has to exist before anything can be measured on a device.

## Requirements
1. A hidden route that runs every uncertain check and prints pass/fail plus the measured value.
2. Engine: sqlite-wasm loaded, the exact `notes_fts` DDL with the porter tokenizer, OPFS writable, real file size.
3. Isolation: `crossOriginIsolated`, `SharedArrayBuffer` present, `hardwareConcurrency`. A missing COOP/COEP header shows up here, not as mysterious slowness later.
4. Model: transformers.js version, whether `webgpu` is offered, the dtype used, tokens per second over a fixed 64-token prompt, time to first token, and peak memory if the browser reports it.
5. Device: user agent, WebView version, `SpeechRecognition` presence, `MediaRecorder` mime support, storage estimate.
6. The result is copyable to the clipboard and downloadable as JSON, so one paste replaces a description of symptoms.
7. The page must not load a model on its own. Inference is a button press, because a diagnostic that downloads 488 MB is worse than no diagnostic.

## Acceptance criteria
- The page loads in both the desktop browser and on the device, and it loads in under two seconds with no model download.
- The measurements decide, in writing, whether the 0.5B chat model is viable on the target phone, and which speech-to-text route is used in task 024.
- The decision is recorded in this task file as a table of measured numbers, not as a summary.

## Progress

### 2026-09-28 — in progress
- The route exists at `/diagnostics`, hidden, and passes the web smoke test as a page check. It reports: Tauri presence, user agent, `crossOriginIsolated`, `SharedArrayBuffer`, `hardwareConcurrency`, storage quota and usage, IndexedDB, WebGPU adapter, `SpeechRecognition`, `getUserMedia`, and the `MediaRecorder` mime types the device accepts.
- Every probe runs in `onMount`, because the web app server-renders and a page that reads `window` at component init returns 500. That was not hypothetical — the first version did exactly that.
- The inference benchmark is behind a button. Nothing downloads on page load, so the page stays under two seconds and never pulls 488 MB by accident. It loads Qwen2.5-0.5B-Instruct at `q4f16`, picks `webgpu` when the browser offers an adapter and `wasm` otherwise, and reports time to first token plus words per second.
- The SQLite engine row is a placeholder: it says the engine is not wired yet, and task 020 replaces it with the real probe.
- Outstanding: the measured numbers. They need a device, and `adb devices` currently lists none. Desktop browser numbers are a useful floor but they do not answer the question, which is what a phone does.

### 2026-09-28 — measured on a Pixel 9 AVD (Android 16, WebView 133, `wv`)
| Measurement | Value | Consequence |
| --- | --- | --- |
| Tauri | present | The shell works. |
| WebGPU | **no adapter available** | The wasm backend is the only option. |
| `crossOriginIsolated` | **false** | Multithreaded WASM is unavailable. |
| `SharedArrayBuffer` | **absent** | onnxruntime runs single-threaded. |
| `hardwareConcurrency` | 4 | Emulator. |
| `SpeechRecognition` | **present** | The Android WebView does expose `webkitSpeechRecognition`, which contradicts the earlier assumption that dictation needs another route. It still has to be proven to work. |
| `getUserMedia` / `MediaRecorder` | available | Recording is possible. |
| Storage quota | 3.5 GB | Enough for the database, but tight for a 488 MB model. |
| 488 MB model download | **killed the app** | The emulator's lowmemorykiller killed the WebView process under memory pressure. |

- The COOP/COEP headers are configured at `app.security.headers`, which is the
  correct path per `tauri-utils/src/config.rs` (`SecurityConfig` owns `headers`,
  and `protocol/tauri.rs` applies them from a code path that is not
  desktop-gated). They are still not reaching the Android WebView, so
  single-threaded WASM is the baseline to measure against.
- The inference benchmark could not be completed on the emulator. The
  tokens/sec number still needs a real device, or a smaller model.
- The page caught a bug in itself: keying the row list on `r.label` threw
  `each_key_duplicate` when the download progress reported the same label twice.
  Rows are now keyed on a counter and the progress row is updated in place.
