<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import TrendingUp from '@lucide/svelte/icons/trending-up';
	import TrendingDown from '@lucide/svelte/icons/trending-down';
	import Minus from '@lucide/svelte/icons/minus';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import { fmtCurrency } from '$lib/currency';
	import ValueChart from '$lib/components/ValueChart.svelte';
	import type { TradingPosition, TradingQuotePoint } from '$lib/types';

	// Full position view, opened by tapping its card or its info button:
	// chart, all card numbers, fee breakdown and buy age plus buy date.
	type Props = {
		p: TradingPosition;
		age?: string | null;
		showOpen?: boolean;
		onOpen?: () => void;
		onEditTarget?: () => void;
		onClose: () => void;
	};
	let { p, age = null, showOpen = false, onOpen, onEditTarget, onClose }: Props = $props();

	// Ripio venues quote in USD (BTC_USDC); B3 stays BRL.
	const cur = $derived(p.orgId === 'ripio' ? 'USD' : 'BRL');

	let points = $state<TradingQuotePoint[] | null>(null);

	onMount(() => {
		void (async () => {
			try {
				const d = await (
					await fetch(`/api/trading/quotes/history?org=${encodeURIComponent(p.orgId)}&ticker=${encodeURIComponent(p.ticker)}`)
				).json();
				points = Array.isArray(d.points) ? d.points : [];
			} catch {
				points = [];
			}
		})();
	});

	const gap = $derived(p.targetPrice !== null && p.quote !== null ? p.targetPrice - p.quote : null);
	const trend = $derived(p.potentialPct === null || Math.abs(p.potentialPct) < 0.005 ? 0 : p.potentialPct);
	const gross = $derived(p.quote === null ? null : p.qty * p.quote);

	function fmtWhen(at: number | null): string {
		if (at === null) return '—';
		try {
			return new Date(at).toLocaleString(undefined, {
				day: 'numeric',
				month: 'short',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return '—';
		}
	}

	function fmtDate(at: number | null): string {
		if (at === null || !Number.isFinite(at) || at <= 0) return '—';
		try {
			return new Date(at).toLocaleDateString(undefined, {
				day: 'numeric',
				month: 'short',
				year: 'numeric'
			});
		} catch {
			return '—';
		}
	}

	function pct(v: number): string {
		return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} %`;
	}
</script>

<div
	class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 dark:bg-black/60 backdrop-blur-md p-4"
	role="dialog"
	aria-modal="true"
	aria-label="{p.ticker} position"
	tabindex="-1"
	onclick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}
	onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Escape') onClose(); }}
	transition:fade={{ duration: motionMs(BACKDROP_MS) }}
>
	<div
		class="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-stone-900"
		transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}
	>
		<div class="flex items-start justify-between gap-2">
			<div class="min-w-0">
				<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">{p.ticker}</h2>
				<p class="mt-0.5 text-[11px] tabular-nums text-stone-500 dark:text-stone-400">
					{Number.isInteger(p.qty) ? p.qty : p.qty.toFixed(2)} shares{#if age} · {age}{/if} · bought {fmtDate(p.since)}
				</p>
				{#if p.quoteSource}
					<p class="mt-0.5 text-[11px] tabular-nums text-stone-500 dark:text-stone-400">via {p.quoteSource}</p>
				{/if}
			</div>
			<button
				type="button"
				class="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg leading-none text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300"
				aria-label="Close"
				onclick={(e) => { e.stopPropagation(); onClose(); }}
			>&times;</button>
		</div>

		<div class="mt-3 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3">
			<h3 class="mb-1 text-[11px] font-medium text-stone-500 dark:text-stone-400">Your position · per day</h3>
			{#if points === null}
				<p class="py-4 text-center text-xs text-stone-400 dark:text-stone-500">Loading your line…</p>
			{:else}
				<ValueChart points={points.map((q) => ({ day: q.day, value: q.value }))} currency={cur} />
			{/if}
		</div>

		<dl class="mt-3 space-y-1.5 text-sm">
			<div class="flex items-baseline justify-between gap-2">
				<dt class="text-[11px] uppercase tracking-wider text-stone-400 dark:text-stone-500">Average buy</dt>
				<dd class="text-right font-semibold tabular-nums text-stone-800 dark:text-stone-200">
					{fmtCurrency(p.avgPrice, cur, 2)}
				</dd>
			</div>
			<div class="flex items-baseline justify-between gap-2">
				<dt class="text-[11px] uppercase tracking-wider text-stone-400 dark:text-stone-500">Cost</dt>
				<dd class="text-right tabular-nums text-stone-600 dark:text-stone-300" title="Total paid including buy fees">
					{fmtCurrency(p.cost, cur, 2)}
				</dd>
			</div>
			<div class="flex items-baseline justify-between gap-2">
				<dt class="text-[11px] uppercase tracking-wider text-stone-400 dark:text-stone-500">Market now</dt>
				<dd class="text-right font-semibold tabular-nums text-stone-800 dark:text-stone-200">
					{p.quote === null ? '—' : fmtCurrency(p.quote, cur, 2)}
					<span class="block text-[11px] font-normal text-stone-400 dark:text-stone-500">{fmtWhen(p.quoteAt)}</span>
				</dd>
			</div>
			<div class="flex items-baseline justify-between gap-2">
				<dt class="text-[11px] uppercase tracking-wider text-stone-400 dark:text-stone-500">Profit</dt>
				<dd class="inline-flex items-center gap-1 text-right font-semibold tabular-nums {trend === 0 ? 'text-stone-500 dark:text-stone-400' : trend > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
					{#if trend === 0}
						<Minus class="h-3.5 w-3.5" />
					{:else if trend > 0}
						<TrendingUp class="h-3.5 w-3.5" />
					{:else}
						<TrendingDown class="h-3.5 w-3.5" />
					{/if}
					{trend === 0 ? '0.00%' : `${trend > 0 ? '+' : ''}${trend.toFixed(2)}%`}
					<span class="font-normal text-stone-400 dark:text-stone-500">/ {(p.targetPct * 100).toFixed(1)}%</span>
				</dd>
			</div>
			<div class="flex items-baseline justify-between gap-2">
				<dt class="text-[11px] uppercase tracking-wider text-stone-400 dark:text-stone-500">Our total, net</dt>
				<dd class="font-semibold tabular-nums text-stone-800 dark:text-stone-200" title="Cash you receive if you sell now, after fees">
					{p.netValue === null ? '—' : fmtCurrency(p.netValue, cur, 2)}
				</dd>
			</div>
			{#if gross !== null && p.netValue !== null}
				{@const f = p.sellFees}
				<div class="rounded-xl bg-stone-100 dark:bg-stone-800 px-3 py-2 text-[11px] tabular-nums leading-relaxed text-stone-600 dark:text-stone-300">
					{fmtCurrency(gross, cur, 2)} at market<br />
					− {fmtCurrency(f?.fee ?? 0, cur, 2)} B3 fee ({pct(f?.feeRatePct ?? 0)})<br />
					− {fmtCurrency(f?.irrf ?? 0, cur, 2)} dedo-duro ({pct(f?.irrfRatePct ?? 0)}){#if (f?.fixed ?? 0) > 0}<br />− {fmtCurrency(f?.fixed ?? 0, cur, 2)} fixed fee{/if}<br />
					= <strong>{fmtCurrency(p.netValue, cur, 2)} net</strong> · Profit = net − cost
				</div>
			{/if}
			<div class="flex items-baseline justify-between gap-2">
				<dt class="text-[11px] uppercase tracking-wider text-stone-400 dark:text-stone-500">Goal {(p.targetPct * 100).toFixed(1)}%</dt>
				<dd class="text-right font-semibold tabular-nums text-stone-800 dark:text-stone-200">
					{p.targetPrice === null ? '—' : fmtCurrency(p.targetPrice, cur, 2)}
					{#if gap !== null}
						<span class="block text-[11px] font-medium {gap <= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
							{gap <= 0 ? 'reached' : `Δ ${fmtCurrency(gap, cur, 2)} to goal`}
						</span>
					{/if}
				</dd>
			</div>
		</dl>

		<div class="mt-4 flex justify-end gap-2">
			{#if onEditTarget}
				<button
					type="button"
					class="rounded-full border border-stone-200 dark:border-stone-800 px-4 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
					onclick={(e) => { e.stopPropagation(); onEditTarget(); }}
				>Edit target</button>
			{/if}
			{#if showOpen}
				<button
					type="button"
					class="rounded-full bg-stone-900 dark:bg-stone-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-stone-800 dark:hover:bg-stone-600"
					onclick={(e) => { e.stopPropagation(); onOpen?.(); }}
				>Open in Trading</button>
			{/if}
			<button
				type="button"
				class="rounded-full border border-stone-200 dark:border-stone-800 px-4 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
				onclick={(e) => { e.stopPropagation(); onClose(); }}
			>Close</button>
		</div>
	</div>
</div>
