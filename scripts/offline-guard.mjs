/**
 * Test-only network guard. Loaded into the smoke-test server with
 * `--import`; active only when FERMENTARIO_TEST_OFFLINE=1.
 *
 * The background indexing pass in GET /api/notes calls transformers.js, which
 * downloads model weights from the Hugging Face CDN when the cache is empty. In a test that means a 22 MB download on every run.
 * Blocking only the Hub hosts makes those passes fail fast, and their failures
 * are already swallowed by the routes.
 *
 * Everything else keeps the real fetch, so SvelteKit's own server-side fetch
 * is unaffected.
 */
if (process.env.FERMENTARIO_TEST_OFFLINE === '1') {
	const real = globalThis.fetch;
	const BLOCKED = /huggingface\.co|hf\.co|hf-mirror|cdn-lfs|xethub/i;
	globalThis.fetch = (input, init) => {
		const url = typeof input === 'string' ? input : (input?.url ?? String(input));
		if (BLOCKED.test(url)) {
			return Promise.reject(new Error(`offline test guard: blocked ${url}`));
		}
		return real(input, init);
	};
}
