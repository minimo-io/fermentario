/**
 * Test-only network guard. Loaded into the smoke-test server with
 * `--import`; active only when FERMENTARIO_TEST_OFFLINE=1.
 *
 * Block known model-hosting sites. This also guards against a future optional
 * dependency making an unexpected network request during a test.
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
