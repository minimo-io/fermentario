<script lang="ts">
	import type { Snippet } from 'svelte';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import CollapsibleSection from '$lib/components/CollapsibleSection.svelte';
	import QuoteDebugModal from '$lib/components/QuoteDebugModal.svelte';

	// One toggleable home card for everything market: the holdings rail,
	// the trading rail, and a single action line with the global Update
	// and the quote-fetch Logs. Per-section refresh buttons are gone.
	type Props = {
		holdingsRail: Snippet;
		tradingRail: Snippet;
		refreshing: boolean;
		onRefresh: () => void;
	};
	let { holdingsRail, tradingRail, refreshing, onRefresh }: Props = $props();

	let debugOpen = $state(false);
</script>

<CollapsibleSection label="Market" storageKey="ferm:market-collapsed" actionsOnExpandOnly>
	{#snippet actions()}
		<button
			type="button"
			class="inline-flex items-center gap-1 rounded-full border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-1 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40"
			aria-label="Update all prices"
			title="Update all prices"
			disabled={refreshing}
			onclick={onRefresh}
		><RefreshCw class="h-3.5 w-3.5 {refreshing ? 'animate-spin' : ''}" /> {refreshing ? 'Updating…' : 'Update'}</button>
		<button
			type="button"
			class="rounded-full border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-1 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
			aria-haspopup="dialog"
			aria-label="Quote fetch history"
			title="Quote fetch history"
			onclick={() => (debugOpen = true)}
		>Logs</button>
	{/snippet}
	<div class="rounded-2xl border border-stone-200/70 dark:border-stone-800/70 bg-white/40 dark:bg-stone-900/40 p-2">
		<CollapsibleSection label="Holdings" storageKey="ferm:holdings-collapsed">
			{@render holdingsRail()}
		</CollapsibleSection>
	</div>
	<div class="mt-2 rounded-2xl border border-stone-200/70 dark:border-stone-800/70 bg-white/40 dark:bg-stone-900/40 p-2">
		<CollapsibleSection label="Trading" storageKey="ferm:trading-collapsed">
			{@render tradingRail()}
		</CollapsibleSection>
	</div>
</CollapsibleSection>

{#if debugOpen}
	<QuoteDebugModal onClose={() => (debugOpen = false)} />
{/if}
