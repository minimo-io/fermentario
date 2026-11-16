<script lang="ts">
	import NostrTab from '$lib/components/NostrTab.svelte';
	import { getContext } from 'svelte';
	import { APP_KEY, type AppContext } from '$lib/app-context';

	const ctx = getContext<AppContext>(APP_KEY);
</script>

<NostrTab onError={ctx.onError} widthClass={ctx.display.widthClass} lang={ctx.display.lang} />
