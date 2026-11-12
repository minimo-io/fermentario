<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import { slide } from 'svelte/transition';
	import { motionMs } from '$lib/motion';
	import { fmtCurrency } from '$lib/currency';
	import { loading } from '$lib/loading.svelte';
	import type { TradingStripItem } from '$lib/types';

	// Home-page strip below the holdings carousel: same card rail, one card
	// per open trading ticker. Tapping a card opens Businesses → Trading.
	type Props = { onOpen: () => void; onError: (msg: string) => void };
	let { onOpen, onError }: Props = $props();

	let positions = $state<TradingStripItem[] | null>(null);
	let refreshing = $state(false);

	const COLLAPSED_KEY = 'ferm:trading-collapsed';
	let collapsed = $state(false);

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

	async function load() {
		try {
			const d = await (await loading.track(fetch('/api/trading/strip'))).json();
			positions = Array.isArray(d.positions) ? d.positions : [];
			// A position without a quote has never been refreshed: fetch once.
			if ((positions ?? []).some((p) => p.quote === null)) await refresh(true);
		} catch {
			onError('Failed to load open trades.');
		}
	}

	async function refresh(quiet = false) {
		const orgs = [...new Set((positions ?? []).map((p) => p.orgId))];
		if (orgs.length === 0) return;
		try {
			if (!quiet) refreshing = true;
			for (const org of orgs) {
				await loading.track(fetch(`/api/trading/summary?org=${encodeURIComponent(org)}&refresh=1`));
			}
			const d = await (await loading.track(fetch('/api/trading/strip'))).json();
			positions = Array.isArray(d.positions) ? d.positions : [];
		} catch {
			if (!quiet) onError('Failed to refresh trade quotes.');
		} finally {
			refreshing = false;
		}
	}

	$effect(() => {
		void load();
		const onChange = () => void load();
		const onVisible = () => {
			if (!document.hidden) void load();
		};
		const timer = setInterval(() => void load(), 60000);
		window.addEventListener('trading:changed', onChange);
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			clearInterval(timer);
			window.removeEventListener('trading:changed', onChange);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});
</script>

{#if positions !== null}
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
		{#if !collapsed && (positions ?? []).length > 0}
			<button
				type="button"
				class="grid h-6 w-6 shrink-0 place-items-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-600 disabled:opacity-50 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-300"
				aria-label="Refresh trade quotes"
				title="Refresh trade quotes"
				disabled={refreshing}
				onclick={() => void refresh(false)}
			><RefreshCw class="h-3.5 w-3.5 {refreshing ? 'animate-spin' : ''}" /></button>
		{/if}
	</div>
	{#if !collapsed}
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
			{#each positions ?? [] as p (p.orgId + p.ticker)}
				<div role="listitem" class="flex w-40 shrink-0 snap-start">
					<button
						type="button"
						class="flex w-full flex-col rounded-2xl border border-stone-200/80 dark:border-stone-800/80 bg-white/70 dark:bg-stone-900/70 p-3 text-left"
						aria-label="Open {p.ticker} in Trading"
						onclick={onOpen}
					>
						<p class="flex items-center gap-1 pr-1 text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
							<span class="truncate">{p.ticker}</span>
							<span
								class="h-1.5 w-1.5 shrink-0 rounded-full {p.recommendation === 'sell' ? 'bg-emerald-500' : p.recommendation === 'daytrade' ? 'bg-rose-500' : p.recommendation === 'hold' ? 'bg-amber-400' : 'bg-stone-300 dark:bg-stone-600'}"
								title={p.recommendation === 'sell' ? 'Time to sell' : p.recommendation === 'daytrade' ? 'Target hit, but selling today is a day trade' : p.recommendation === 'hold' ? 'Holding' : 'No quote yet'}
							></span>
						</p>
						<p class="mt-1 truncate text-xl font-semibold tabular-nums text-stone-800 dark:text-stone-200">
							{p.quote === null ? '—' : fmtCurrency(p.qty * p.quote, 'BRL', 2)}
						</p>
						<span class="mt-0.5 inline-flex items-center gap-1 self-start rounded-full px-2 py-px text-[10px] font-medium {p.recommendation === 'sell' ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200' : p.recommendation === 'daytrade' ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300' : p.recommendation === 'hold' ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200' : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'}">
							{p.recommendation === 'sell' ? 'Sell' : p.recommendation === 'daytrade' ? 'Day trade' : p.recommendation === 'hold' ? 'Hold' : 'No quote'}
						</span>
						<p class="truncate text-sm tabular-nums text-stone-600 dark:text-stone-300">
							{Number.isInteger(p.qty) ? p.qty : p.qty.toFixed(2)} shares
						</p>
					</button>
				</div>
			{/each}
			</div>
		{/if}
	{/if}
{/if}
