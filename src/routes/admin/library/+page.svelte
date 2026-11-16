<script lang="ts">
	import LibraryTab from '$lib/components/LibraryTab.svelte';
	import { getContext } from 'svelte';
	import { APP_KEY, type AppContext } from '$lib/app-context';

	const ctx = getContext<AppContext>(APP_KEY);
</script>

<LibraryTab onError={ctx.onError} widthClass={ctx.display.widthClass} lang={ctx.display.lang} />
