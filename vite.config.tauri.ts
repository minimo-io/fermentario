import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

/**
 * Build target for the Tauri app. The web app on `vite.config.ts` is a
 * different target and is not affected by anything here.
 *
 * Two things are deliberate:
 *
 * 1. The kit options are passed inline and flat. Passing anything to
 *    `sveltekit()` makes the plugin ignore `svelte.config.js`, so this file
 *    states its own adapter. Flat, because `split_config()` only keeps the keys
 *    in `kit_options`, which are the contents of `kit`; a `kit: { … }` wrapper
 *    is forwarded to vite-plugin-svelte and silently dropped.
 *
 * 2. `csr: true` instead of `export const ssr = false` in `+layout.ts`. It is a
 *    build option, so the web app's source stays untouched. The app already
 *    renders an empty shell on the server — no note text appears in the HTML —
 *    so SPA mode costs the web app nothing, but it is still better not to
 *    change shared source to achieve it.
 *
 * Output goes to `dist-static/`, and the intermediate build to
 * `.svelte-kit/output-static/`, so this build can never clobber adapter-node's
 * `build/`.
 */

/**
 * `TAURI_DEV_HOST` is set by `tauri dev` for a physical device on the network.
 * It is deliberately not used for binding: an emulator reaches the host through
 * 10.0.2.2 and a device on Wi-Fi through the LAN address, so the server has to
 * listen on every interface. Binding to localhost only is what produced a blank
 * white window — the WebView asked for localhost:1420 from inside the emulator,
 * where nothing was listening.
 */
const host = process.env.TAURI_DEV_HOST;
const port = 1420;

const coiHeaders = {
	// SharedArrayBuffer, which onnxruntime-web needs for multithreaded WASM.
	// Without these it silently falls back to one thread, so the symptom is
	// slowness rather than an error.
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Embedder-Policy': 'require-corp'
};

export default defineConfig({
	// The app answers its own /api/* calls from a database on the device, so
	// `src/hooks.client.ts` installs the local API. The web build does not set
	// this and keeps talking to the Node server.
	define: { __LOCAL_DB__: 'true' },
	server: {
		port,
		strictPort: true,
		host: true,
		hmr: host ? { protocol: 'ws', host, port: port + 1 } : undefined,
		headers: coiHeaders,
		watch: { ignored: ['**/data/**', '**/src-tauri/**'] }
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter({ pages: 'dist-static', assets: 'dist-static', fallback: 'index.html' }),
			outDir: '.svelte-kit/output-static'
		})
	]
});
