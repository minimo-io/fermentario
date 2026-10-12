Status: [TODO]

# Android packaging

## Context
- A debug build that runs on a USB-attached phone is not a shippable app. This task covers the parts that fail late and are expensive to discover late: the ABI list, the icon, the signing config and the app bundle format.

## Requirements
1. Gradle configuration: minSdk 24, `arm64-v8a` as the primary ABI.
2. App icon and splash, at the Android density buckets.
3. JDK 17, pinned so the build does not depend on whatever Java is on the PATH.
4. Debug signing for local installs, and a release keystore that is not committed. The keystore path comes from the environment, with a clear error when it is missing.
5. `tauri android build` produces an AAB for Play and an APK for direct install.

## Acceptance criteria
- A release AAB builds and installs on the device.
- The app upgrades over the debug build without losing notes. This is the real upgrade risk: an app that loses the journal on update is not shippable, so the upgrade path is tested, not assumed.
- `node scripts/web-smoke.mjs` reports no differences.

## Progress
