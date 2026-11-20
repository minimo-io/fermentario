<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Minus from '@lucide/svelte/icons/minus';
	import TrendingDown from '@lucide/svelte/icons/trending-down';
	import TrendingUp from '@lucide/svelte/icons/trending-up';
	import { slide } from 'svelte/transition';
	import { motionMs } from '$lib/motion';
	import { fmtCurrency } from '$lib/currency';
	import TradingPositionCard from '$lib/components/TradingPositionCard.svelte';
	import TradingPositionModal from '$lib/components/TradingPositionModal.svelte';
	import { tradingStrip } from '$lib/trading-strip.svelte';
	import type { TradingStripItem } from '$lib/types';

	// Home-page strip below the holdings carousel: same card rail, one card
	// per open trading ticker. Tapping a card opens Businesses → Trading.
	// The positions, totals and goal alerts live in the trading-strip store,
	// outside the collapsible body: a collapse must still show the totals.
	type Props = {
		onOpen: () => void;
		bare?: boolean;
		/** The admin layout owns the quote refresh so it can update holdings too. */
		onRefreshTicker?: (ticker: string) => void;
		refreshingTicker?: string | null;
	};
	let { onOpen, bare = false, onRefreshTicker, refreshingTicker = null }: Props = $props();

	const positions = $derived(tradingStrip.positions);
	const totals = $derived(tradingStrip.totals);
	// Now against invested: the total card's own line, green when the rail
	// is in profit and red when it is not.
	const delta = $derived.by(() => {
		const t = totals;
		if (!t) return null;
		const now = t.now.USD;
		const invested = t.invested.USD;
		if (now === null || invested === null || !(invested > 0)) return null;
		return { value: now - invested, pct: ((now - invested) / invested) * 100 };
	});

	let selected = $state<TradingStripItem | null>(null);

	const COLLAPSED_KEY = 'ferm:trading-collapsed';
	let collapsed = $state(false);

	function money(value: number | null, currency: string): string {
		return value === null ? '—' : fmtCurrency(value, currency, 0);
	}

	$effect(() => {
		try {
			collapsed = localStorage.getItem(COLLAPSED_KEY) === '1';
		} catch {}
	});

	function toggleCollapsed() {
		collapsed = !collapsed;
		try {
			localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
		} catch {}
	}
</script>

{#if positions !== null}
	{#if !bare}
	<div class="mb-1 flex items-center gap-1">
		<button
			type="button"
			class="flex min-w-0 items-center gap-1 rounded-full pr-2 text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300"
			aria-expanded={!collapsed}
			aria-label={collapsed ? 'Expand trading' : 'Collapse trading'}
			onclick={toggleCollapsed}
		>
			<span class="grid h-6 w-6 shrink-0 place-items-center">
				<ChevronDown class="h-4 w-4 transition-transform duration-200 motion-reduce:transition-none {collapsed ? '-rotate-90' : ''}" />
			</span>
			<span class="text-xs font-medium uppercase tracking-widest">Trading</span>
		</button>
	</div>
	{/if}
	{#if bare || !collapsed}
		{#if (positions ?? []).length === 0}
			<button
				type="button"
				class="block w-full rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 px-4 py-6 text-center text-sm text-stone-500 dark:text-stone-400"
				aria-label="Open Trading"
				onclick={onOpen}
			>No open trades — record the first buy in Trading.</button>
		{:else}
			<div
				class="flex snap-x items-stretch gap-2 overflow-x-auto no-scrollbar pb-1"
				role="list"
				aria-label="Open trades"
				transition:slide={{ duration: motionMs(180) }}
			>
			{#if totals}
				<!-- First card is the rail's money, in the holdings total-card
					style: invested (buy net), now (a sale at the stored quote),
					and at goals (the net each goal asks for). -->
				<div
					role="listitem"
					class="flex w-40 shrink-0 snap-start flex-col rounded-2xl bg-stone-950 text-stone-50 dark:border dark:border-stone-700 p-3"
				>
					<p class="text-[11px] font-bold uppercase tracking-wider text-stone-400">
						Totals · {totals.count} {totals.count === 1 ? 'trade' : 'trades'}
					</p>
					<div class="mt-1 space-y-2 text-[11px] tabular-nums leading-tight">
						<div>
							<p class="uppercase tracking-wider text-stone-400">Invested</p>
							<p class="break-all font-bold">{money(totals.invested.USD, 'USD')}</p>
							<p class="truncate text-[10px] text-stone-400">{money(totals.invested.BRL, 'BRL')} · {money(totals.invested.UYU, 'UYU')}</p>
						</div>
						<div>
							<p class="uppercase tracking-wider text-stone-400">Now</p>
							<p class="break-all font-bold">{money(totals.now.USD, 'USD')}</p>
							<p class="truncate text-[10px] text-stone-400">{money(totals.now.BRL, 'BRL')} · {money(totals.now.UYU, 'UYU')}</p>
							{#if delta}
								<p class="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium {delta.value > 0 ? 'text-emerald-400' : delta.value < 0 ? 'text-rose-400' : 'text-stone-400'}" title="Current value minus invested">
									{#if delta.value > 0}<TrendingUp class="h-3 w-3 shrink-0" />{:else if delta.value < 0}<TrendingDown class="h-3 w-3 shrink-0" />{:else}<Minus class="h-3 w-3 shrink-0" />{/if}
									<span class="truncate">{delta.value >= 0 ? '+' : '−'}{money(Math.abs(delta.value), 'USD')} ({delta.pct >= 0 ? '+' : ''}{delta.pct.toFixed(2)}%)</span>
								</p>
							{/if}
						</div>
						<div>
							<p class="uppercase tracking-wider text-stone-400">At goals</p>
							<p class="break-all font-bold text-emerald-400">{money(totals.atGoal.USD, 'USD')}</p>
							<p class="truncate text-[10px] text-emerald-400/80">{money(totals.atGoal.BRL, 'BRL')} · {money(totals.atGoal.UYU, 'UYU')}</p>
						</div>
					</div>
					{#if totals.missingQuotes > 0}
						<p class="mt-auto pt-1 text-[10px] text-amber-400">{totals.missingQuotes} without quote</p>
					{/if}
				</div>
			{/if}
			{#each positions ?? [] as p (p.orgId + p.ticker)}
				<div role="listitem" class="flex w-40 shrink-0 snap-start">
					<button
						type="button"
						class="w-full text-left"
						aria-label="Open {p.ticker} details"
						aria-haspopup="dialog"
						onclick={() => (selected = p)}
					>
						<TradingPositionCard
							p={{ ...p, quoteSource: null }}
							compact
							onRefresh={onRefreshTicker ? () => onRefreshTicker(p.ticker) : undefined}
							refreshing={refreshingTicker === p.ticker}
						/>
					</button>
				</div>
			{/each}
			</div>
		{/if}
	{/if}
{/if}

{#if selected}
	{@const s = selected}
	<TradingPositionModal
		p={{ ...s, quoteSource: null }}
		showOpen
		onOpen={() => { selected = null; onOpen(); }}
		onClose={() => (selected = null)}
	/>
{/if}
