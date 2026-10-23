<script lang="ts">
	import '../app.css';
	import { onMount } from 'svelte';
	import NavigationLoader from '$lib/components/NavigationLoader.svelte';
	import Toasts from '$lib/components/Toasts.svelte';
	import GlobalSearch from '$lib/components/GlobalSearch.svelte';
	import { applyStoredTheme, watchSystemTheme } from '$lib/theme';
	let { children } = $props();

	// app.html applies the theme before first paint. Re-applying on mount keeps
	// the document in sync after hydration, and the watcher follows the OS
	// preference while the user keeps the `system` choice.
	onMount(() => {
		applyStoredTheme();
		return watchSystemTheme();
	});
</script>

<svelte:head>
	<title>fermentario</title>
	<meta name="description" content="voice journal for life and the bootstrapped journey" />
	<!-- `src/lib/assets/favicon.svg` is the SvelteKit starter's logo and is not
	     referenced by anything. This is the real one. Root-relative on purpose:
	     `%sveltekit.assets%` is not substituted by this SvelteKit version, and
	     the browser then requests `/%sveltekit.assets%/favicon.svg`, which makes
	     the dev server throw `URIError: URI malformed` from decodeURI. -->
	<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
</svelte:head>

{@render children()}
<GlobalSearch />
<NavigationLoader />
<Toasts />
