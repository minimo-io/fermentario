<script lang="ts">
	import StocksTab from '$lib/components/StocksTab.svelte';
	import { getContext } from 'svelte';
	import { APP_KEY, type AppContext } from '$lib/app-context';

	const ctx = getContext<AppContext>(APP_KEY);
</script>

<StocksTab onError={ctx.onError} widthClass={ctx.display.widthClass} lang={ctx.display.lang} />
