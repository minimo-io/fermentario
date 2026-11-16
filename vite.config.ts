import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig, type Plugin } from 'vite';
import type { Server } from 'node:http';
import adapter from '@sveltejs/adapter-node';

/**
 * Serve the Nostr relay while developing too. Production attaches it in
 * `scripts/start.mjs`; here the dev server's own HTTP server is the only place
 * that can carry the upgrade. `strictPaths: false` keeps Vite's HMR socket
 * working: the listener steps aside for every path except `/relay`.
 */
function nostrRelayDev(): Plugin {
	return {
		name: 'fermentario-nostr-relay',
		configureServer(server) {
			const httpServer = server.httpServer;
			if (!httpServer) return;
			void import('./scripts/relay.mjs').then(({ attachRelay }) =>
				// Vite types its server as a union with HTTP/2; in dev it is the
				// plain HTTP/1 server, which is what the upgrade listener needs.
				attachRelay(httpServer as unknown as Server, { dataDir: './data', strictPaths: false })
			);
		}
	};
}

export default defineConfig({
	server: {
		host: true,
		port: 4173,
		strictPort: true,
		// The SQLite database lives inside the project. Every note write touches
		// it, and Vite must not treat those changes as a reason to reload.
		watch: { ignored: ['**/data/**'] }
	},
	plugins: [
		tailwindcss(),
		nostrRelayDev(),
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Passing any option to sveltekit() makes the plugin ignore
			// svelte.config.js entirely, so the adapter has to be passed here as
			// well. Without it `vite build` finishes with "No adapter specified"
			// and writes nothing to build/.
			//
			// The option is flat, not nested: split_config() keeps only the keys
			// listed in `kit_options`, which are the contents of `kit`. A
			// `kit: { … }` wrapper is not one of them, so it is forwarded to
			// vite-plugin-svelte and the adapter is dropped without a word.
			adapter: adapter()
		})
	]
});
