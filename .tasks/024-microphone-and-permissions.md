Status: [TODO]

# Microphone and Android permissions

## Context
- The Android WebView has no `SpeechRecognition`, so `src/lib/speech.ts` cannot work on a phone. The route chosen in task 022 decides what replaces it.
- Tauri v2 replaced v1's allowlist with capability files. Permissions are JSON in `src-tauri/capabilities/`, and mobile-only permissions are scoped with `platforms: ["android"]`.
- Two candidate routes: `MediaRecorder` to a server, which needs the web app running and contradicts the offline goal, or an on-device Whisper, which adds a third model and a second inference engine. Keyboard-first remains the fallback either way, so nothing else is blocked.
- `RECORD_AUDIO` needs a manifest entry *and* a runtime request. A manifest entry alone does nothing on Android 6 and later.

## Requirements
1. `RECORD_AUDIO` in `src-tauri/gen/android/app/src/main/AndroidManifest.xml`.
2. A runtime permission request, with denial handled by the existing error path rather than a crash or a silent no-op.
3. `capabilities/android.json` with `platforms: ["android"]`, granting only the fs scopes the app uses for app data.
4. The speech-to-text route from task 022, or a recorded decision to ship keyboard-only and defer it.

## Acceptance criteria
- The microphone works on the device and a denial produces an error, not a crash.
- The app runs with permissions denied, which is how a user who taps "don't allow" sees it.
- `node scripts/web-smoke.mjs` reports no differences.

## Progress
