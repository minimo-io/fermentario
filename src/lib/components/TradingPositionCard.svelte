<script lang="ts">
	import TrendingUp from '@lucide/svelte/icons/trending-up';
	import TrendingDown from '@lucide/svelte/icons/trending-down';
	import Minus from '@lucide/svelte/icons/minus';
	import Info from '@lucide/svelte/icons/info';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import { fmtCurrency } from '$lib/currency';
	import TradingPositionModal from '$lib/components/TradingPositionModal.svelte';
	import { coinLabel } from '$lib/trading-pairs';
	import type { TradingPosition } from '$lib/types';

	// One open-position card, shared by the home strip and the Trading
	// panel. Compact mode keeps value, pill, shares, average and trend;
	// detail adds cost, open age, quote source and the target row.
	type Props = {
		p: TradingPosition;
		compact?: boolean;
		age?: string | null;
		onEditTarget?: () => void;
		/** Record a full sale of this position. Omitted when selling is closed. */
		onSell?: () => void;
		/** Refresh this ticker's quote. Omitted when there is nothing to refresh. */
		onRefresh?: () => void;
		refreshing?: boolean;
	};
	let { p, compact = false, age = null, onEditTarget, onSell, onRefresh, refreshing = false }: Props = $props();

	// Ripio venues quote in USD (BTC_USDC); B3 stays BRL.
	const cur = $derived(p.orgId === 'ripio' ? 'USD' : 'BRL');
	// A Ripio buy is a fractional amount of the coin, never a count of shares.
	const unit = $derived(p.orgId === 'ripio' ? coinLabel(p.ticker, p.orgId) : 'shares');
	// A crypto quantity runs to eight decimals, and the coin name after it
	// squeezed the Hold/Sell pill into `Ho…`. The header already prints the
	// coin, so the quantity stands alone and keeps the full pill.
	const crypto = $derived(p.orgId === 'ripio');
	const qtyText = $derived(
		p.orgId === 'ripio'
			? p.qty.toLocaleString('pt-BR', { maximumFractionDigits: 8 })
			: Number.isInteger(p.qty)
				? String(p.qty)
				: p.qty.toFixed(2)
	);

	let infoOpen = $state(false);

	const trend = $derived(p.potentialPct === null || Math.abs(p.potentialPct) < 0.005 ? 0 : p.potentialPct);
	const gapToGoal = $derived(
		p.targetPrice !== null && p.quote !== null ? Math.max(0, p.targetPrice - p.quote) : null
	);
	// Money at the goal, from the same rule the diary uses: the goal price
	// nets `cost × (1 + target)`, so the gain is `cost × target`. Derived
	// from the cost basis, which already carries the buy fee.
	const atGoal = $derived(
		p.cost > 0 && p.targetPct > 0 ? { net: p.cost * (1 + p.targetPct), gain: p.cost * p.targetPct } : null
	);
	const reached = $derived(p.quote !== null && p.targetPrice !== null ? p.quote >= p.targetPrice : null);
	const gapTone = $derived(
		reached === null
			? 'text-stone-500 dark:text-stone-400'
			: reached
				? 'text-emerald-600 dark:text-emerald-400'
				: 'text-rose-600 dark:text-rose-400'
	);
	const dot = $derived(
		p.recommendation === 'sell'
			? 'bg-emerald-500'
			: p.recommendation === 'daytrade'
				? 'bg-rose-500'
				: p.recommendation === 'hold'
					? 'bg-amber-400'
					: 'bg-stone-300 dark:bg-stone-600'
	);
	const pill = $derived(
		p.recommendation === 'sell'
			? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200'
			: p.recommendation === 'daytrade'
				? 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'
				: p.recommendation === 'hold'
					? 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200'
					: 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'
	);
</script>

{#snippet goalBox()}
	<div
		class="mt-1 rounded-xl border border-stone-200/70 dark:border-stone-700/60 bg-stone-50 dark:bg-stone-800/50 px-2 py-1 text-[11px] tabular-nums text-stone-500 dark:text-stone-400"
		role="group"
		aria-label="Goal"
		title={atGoal ? `Net at goal ${fmtCurrency(atGoal.net, cur, 2)} after both fees` : undefined}
	>
		<p class="text-[9px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">Goal</p>
		<p class="mt-0.5 flex items-baseline justify-between gap-1">
			<span class="text-stone-400 dark:text-stone-500">price</span>
			<span class="font-medium text-stone-700 dark:text-stone-200">{p.targetPrice === null ? '—' : fmtCurrency(p.targetPrice, cur, 2)}</span>
		</p>
		{#if atGoal}
			<p class="flex items-baseline justify-between gap-1">
				<span class="text-stone-400 dark:text-stone-500">gross</span>
				<span>{fmtCurrency(p.qty * (p.targetPrice ?? 0), cur, 2)}</span>
			</p>
			<p class="flex items-baseline justify-between gap-1">
				<span class="text-stone-400 dark:text-stone-500">net</span>
				<span>{fmtCurrency(atGoal.net, cur, 2)}</span>
			</p>
			<p class="flex items-baseline justify-between gap-1 font-medium text-emerald-600 dark:text-emerald-400">
				<span>gain</span>
				<span>+{fmtCurrency(atGoal.gain, cur, 2)}</span>
			</p>
		{/if}
	</div>
{/snippet}

<div class="flex h-full w-full flex-col rounded-2xl border border-stone-200/80 dark:border-stone-800/80 bg-white/70 dark:bg-stone-900/70 p-3 text-left">
	<div class="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
		<p class="flex items-center justify-between gap-1">
			<span class="flex min-w-0 items-center gap-1">
				<span class="truncate">{coinLabel(p.ticker, p.orgId)}</span>
				<span class="h-1.5 w-1.5 shrink-0 rounded-full {dot}"></span>
			</span>				<span class="flex shrink-0 items-center gap-0.5">
					<button
						type="button"
						class="grid h-5 w-5 shrink-0 place-items-center rounded-full text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300"
						aria-label="What is the big number?"
					aria-haspopup="dialog"
					title="What is the big number?"
					onclick={(e) => { e.stopPropagation(); infoOpen = true; }}
				><Info class="h-3.5 w-3.5" /></button>
				{#if onRefresh}
					<button
						type="button"
						class="grid h-5 w-5 shrink-0 place-items-center rounded-full text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300 disabled:opacity-40"
						aria-label="Refresh {coinLabel(p.ticker, p.orgId)} price"
						title="Refresh {coinLabel(p.ticker, p.orgId)} price"
						disabled={refreshing}
						onclick={(e) => { e.stopPropagation(); onRefresh(); }}
					><RefreshCw class="h-3.5 w-3.5 {refreshing ? 'animate-spin motion-reduce:animate-none' : ''}" /></button>
				{/if}
			</span>
		</p>
	</div>
	<p class="mt-1 truncate text-lg font-semibold tabular-nums text-stone-800 dark:text-stone-200" title="Cash you receive if you sell now, after fees and spread">
		{p.netValue === null ? '—' : fmtCurrency(p.netValue, cur, 2)}
	</p>
	<p class="truncate text-[11px] tabular-nums text-stone-500 dark:text-stone-400" title="Total paid including buy fees">
		cost {fmtCurrency(p.cost, cur, 2)}
	</p>
	<p class="mt-0.5 flex items-center justify-between gap-1">
		<span class="inline-flex items-center gap-1 rounded-full px-2 py-px text-[10px] font-medium {crypto ? 'shrink-0' : 'min-w-0 truncate'} {pill}">
			<span class="truncate">{p.recommendation === 'sell' ? 'Sell' : p.recommendation === 'daytrade' ? 'Day trade' : p.recommendation === 'hold' ? 'Hold' : 'No quote'}</span>
		</span>
		<span
			class="min-w-0 truncate text-[11px] tabular-nums text-stone-600 dark:text-stone-300"
			title={crypto ? `${qtyText} ${unit}` : undefined}
		>
			{qtyText}{crypto ? '' : ` ${unit}`}
		</span>
	</p>
	{#if compact}
	<p class="mt-0.5 truncate text-[11px] tabular-nums text-stone-500 dark:text-stone-400">
		avg {fmtCurrency(p.avgPrice, cur, 2)}
	</p>
	{@render goalBox()}
	<p class="mt-0.5 truncate text-[11px] tabular-nums text-stone-500 dark:text-stone-400">
		now <span class="font-semibold text-stone-700 dark:text-stone-200">{p.quote === null ? '—' : fmtCurrency(p.quote, cur, 2)}</span>
	</p>
	<p class="mt-0.5 flex items-center gap-1 truncate text-[11px] tabular-nums text-stone-500 dark:text-stone-400">
		profit
		<span class="inline-flex items-center gap-0.5 font-medium {trend === 0 ? '' : trend > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
			{#if trend === 0}
				<Minus class="h-3 w-3 shrink-0" />
			{:else if trend > 0}
				<TrendingUp class="h-3 w-3 shrink-0" />
			{:else}
				<TrendingDown class="h-3 w-3 shrink-0" />
			{/if}
			{trend === 0 ? '0.00%' : `${trend > 0 ? '+' : ''}${trend.toFixed(2)}%`}
		</span>
		<span class="text-stone-400 dark:text-stone-500">/ {(p.targetPct * 100).toFixed(1)}%</span>
	</p>
	<p class="truncate text-[11px] tabular-nums {gapTone}">
		{gapToGoal === null ? 'Δ — to goal' : `Δ ${fmtCurrency(gapToGoal, cur, 2)} to goal`}
	</p>
	{/if}
	{#if !compact}
		<p class="mt-0.5 truncate text-[11px] tabular-nums text-stone-500 dark:text-stone-400">
			avg {fmtCurrency(p.avgPrice, cur, 2)}
		</p>
		{#if onEditTarget}
			<div class="mt-0.5 flex items-center gap-2">
				<div class="min-w-0 flex-1">{@render goalBox()}</div>
				<button
					type="button"
					class="shrink-0 rounded-full border border-stone-200 dark:border-stone-800 px-2.5 py-0.5 text-[11px] font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
					aria-haspopup="dialog"
					onclick={(e) => { e.stopPropagation(); onEditTarget(); }}
				>Edit target</button>
			</div>
		{:else}
			{@render goalBox()}
		{/if}
		<p class="mt-0.5 truncate text-[11px] tabular-nums text-stone-500 dark:text-stone-400">
			now <span class="font-semibold text-stone-700 dark:text-stone-200">{p.quote === null ? '—' : fmtCurrency(p.quote, cur, 2)}</span>
		</p>
		<p class="mt-0.5 flex items-center gap-1 truncate text-[11px] tabular-nums text-stone-500 dark:text-stone-400">
			profit
			<span class="inline-flex items-center gap-0.5 font-medium {trend === 0 ? '' : trend > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
				{#if trend === 0}
					<Minus class="h-3 w-3 shrink-0" />
				{:else if trend > 0}
					<TrendingUp class="h-3 w-3 shrink-0" />
				{:else}
					<TrendingDown class="h-3 w-3 shrink-0" />
				{/if}
				{trend === 0 ? '0.00%' : `${trend > 0 ? '+' : ''}${trend.toFixed(2)}%`}
			</span>
			<span class="text-stone-400 dark:text-stone-500">/ {(p.targetPct * 100).toFixed(1)}%</span>
		</p>
		<p class="truncate text-[11px] tabular-nums {gapTone}">
			{gapToGoal === null ? 'Δ — to goal' : `Δ ${fmtCurrency(gapToGoal, cur, 2)} to goal`}
		</p>
		{#if age}
			<p class="mt-0.5 text-[11px] tabular-nums text-stone-500 dark:text-stone-400">{age}</p>
		{/if}
		{#if p.quoteSource}
			<p class="mt-0.5 truncate text-[11px] tabular-nums text-stone-500 dark:text-stone-400">via {p.quoteSource}</p>
		{/if}
	{/if}
	{#if onSell}
		<div class="mt-auto">
			<button
				type="button"
				class="mt-2 w-full rounded-full bg-rose-100 px-3 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-200 dark:bg-rose-900/40 dark:text-rose-300 dark:hover:bg-rose-900/60"
				aria-label="Sell all {coinLabel(p.ticker, p.orgId)}"
				aria-haspopup="dialog"
				title="Sell all {coinLabel(p.ticker, p.orgId)}"
				onclick={(e) => { e.stopPropagation(); onSell(); }}
			>Sell</button>
		</div>
	{/if}
</div>

{#if infoOpen}
	<TradingPositionModal {p} {age} {onEditTarget} onClose={() => (infoOpen = false)} />
{/if}
