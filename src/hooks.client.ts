import { installLocalApi } from '$lib/platform/local-api';

/**
 * Client start-up.
 *
 * In the Tauri build there is no server, so the journal lives on the device and
 * the `/api/*` calls the pages already make are answered from it. The flag is
 * set by `vite.config.tauri.ts`; in the web build it is false and this file
 * does nothing, which is what keeps the web app byte-identical.
 */
declare const __LOCAL_DB__: boolean;

if (typeof __LOCAL_DB__ !== 'undefined' && __LOCAL_DB__) {
	installLocalApi();
}
