<script lang="ts">
	import BusinessesTab from '$lib/components/BusinessesTab.svelte';
	import { getContext } from 'svelte';
	import { page } from '$app/state';
	import { APP_KEY, type AppContext } from '$lib/app-context';

	const ctx = getContext<AppContext>(APP_KEY);
	const orgId = $derived(page.params.org ?? 'b3');
</script>

{#key orgId}
	<BusinessesTab
		sub="trading"
		orgId={orgId}
		onError={ctx.onError}
		lang={ctx.display.lang}
		widthClass={ctx.display.widthClass}
		onRefreshTicker={ctx.market.onRefreshTicker}
		refreshingTicker={ctx.market.refreshingTicker}
	/>
{/key}
