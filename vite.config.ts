import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import adapter from '@sveltejs/adapter-node';

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
