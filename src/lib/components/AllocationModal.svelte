<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import type { HoldingsSummary, HoldingCategory, Holding, CategoryValueProgress } from '$lib/types';
	// Holding stats: totals by category with configured vs actual share,
	// independent value targets, plus every asset underneath. Read-only;
	// goals are edited from the totals card. Same overlay standard as every
	// other dialog.
	type Props = {
		summary: HoldingsSummary;
		onClose: () => void;
	};
	let { summary, onClose }: Props = $props();

	const CATEGORIES: { key: HoldingCategory; label: string }[] = [
		{ key: 'btc', label: 'Bitcoin' },
		{ key: 'fii', label: 'FII investments' },
		{ key: 'cash', label: 'Bank / cash' }
	];

	const assetsByCategory = $derived(
		Object.fromEntries(
			CATEGORIES.map((c) => [
				c.key,
				summary.holdings
					.filter((h) => h.category === c.key)
					.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0))
			])
		) as Record<HoldingCategory, Holding[]>
	);

	function usdFor(c: HoldingCategory): number {
		return (summary.actual[c] / 100) * summary.totalUsd;
	}

	// Same three bands as the dot on each holding card, so the modal and
	// the carousel can never disagree: green within 2 points, yellow within
	// 5, red beyond.
	function bandFor(actual: number, goal: number | null): 'on' | 'near' | 'off' {
		if (goal === null) return 'on';
		const diff = Math.abs(actual - goal);
		return diff <= 2 ? 'on' : diff <= 5 ? 'near' : 'off';
	}

	const BAND_FILL = { on: 'bg-emerald-500', near: 'bg-amber-400', off: 'bg-rose-500' } as const;
	const BAND_TEXT = { on: '', near: 'text-amber-600 dark:text-amber-400', off: 'text-rose-600 dark:text-rose-400' } as const;

	function fmtUsd(v: number): string {
		try {
			return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
		} catch {
			return `$${v.toFixed(0)}`;
		}
	}

	function fmtMoney(v: number, currency: string): string {
		const locale = currency === 'BRL' ? 'pt-BR' : currency === 'UYU' ? 'es-UY' : 'en-US';
		try {
			return new Intl.NumberFormat(locale, {
				style: 'currency',
				currency,
				maximumFractionDigits: 0
			}).format(v);
		} catch {
			return `${currency} ${Math.round(v).toLocaleString('en-US')}`;
		}
	}

	const valueByCategory = $derived(
		Object.fromEntries(summary.valueProgress.map((v) => [v.category, v])) as Partial<
			Record<HoldingCategory, CategoryValueProgress>
		>
	);

	// Cached FX per USD, the same pair the totals card displays.
	const rates = $derived(
		summary.totalUsd > 0
			? {
					BRL: summary.displayTotals.BRL === null ? null : summary.displayTotals.BRL / summary.totalUsd,
					UYU: summary.displayTotals.UYU === null ? null : summary.displayTotals.UYU / summary.totalUsd
				}
			: { BRL: null, UYU: null }
	);
</script>

<div
	class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 dark:bg-black/60 backdrop-blur-md p-4"
	role="dialog"
	aria-modal="true"
	aria-label="Holding stats"
	tabindex="-1"
	onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
	onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
	transition:fade={{ duration: motionMs(BACKDROP_MS) }}
>
	<div
		class="w-full max-w-sm rounded-2xl bg-white dark:bg-stone-900 p-5 shadow-xl"
		transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}
	>
		<div class="flex items-start justify-between gap-2">
			<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">Holding stats</h2>
			<button
				type="button"
				class="-mr-1 -mt-1 grid h-8 w-8 place-items-center rounded-full text-lg leading-none text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300"
				aria-label="Close"
				onclick={onClose}
			>&times;</button>
		</div>
		<p class="mt-0.5 text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
			Total {fmtUsd(summary.totalUsd)}{#if summary.asOf} · {new Date(summary.asOf).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}{#if summary.stale} · stale{/if}{/if}
		</p>
		<ul class="mt-3 space-y-3">
			{#each CATEGORIES as c (c.key)}
				{@const goal = summary.goals?.[c.key] ?? null}
				{@const actual = summary.actual[c.key]}
				{@const band = bandFor(actual, goal)}
				{@const categoryUsd = usdFor(c.key)}
				{@const gapUsd = goal === null ? 0 : Math.abs(((goal - actual) / 100) * summary.totalUsd)}
				{@const value = valueByCategory[c.key]}
				<li>
					<div class="flex items-baseline justify-between gap-2">
						<span class="text-xs font-medium text-stone-700 dark:text-stone-300">{c.label}</span>
						<span class="truncate text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
							{fmtUsd(usdFor(c.key))} · {actual.toFixed(1)}%{#if goal !== null} · goal {goal}%{/if}
						</span>
					</div>
					<div class="relative mt-1 h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800" role="img" aria-label="{c.label} {actual.toFixed(1)} percent{goal !== null ? `, goal ${goal} percent` : ''}">
						<div
							class="absolute inset-y-0 left-0 rounded-full {BAND_FILL[band]}"
							style="width: {Math.min(100, Math.max(0, actual))}%"
						></div>
						{#if goal !== null}
							<div class="absolute inset-y-0 w-0.5 bg-stone-900 dark:bg-white" style="left: {Math.min(100, Math.max(0, goal))}%" title="Goal {goal}%"></div>
						{/if}
					</div>
					{#if goal !== null && band !== 'on'}
						<p class="mt-0.5 text-[11px] tabular-nums {BAND_TEXT[band]}">
							{actual > goal ? `${(actual - goal).toFixed(1)} over · Trim` : `${(goal - actual).toFixed(1)} under · Need`}{' '}
							{fmtUsd(gapUsd)}{#if rates.BRL !== null} · {fmtMoney(gapUsd * rates.BRL, 'BRL')}{/if}{#if rates.UYU !== null} · {fmtMoney(gapUsd * rates.UYU, 'UYU')}{/if}
						</p>
					{/if}
					{#if value}
						<div class="mt-2">
							<div class="flex items-baseline justify-between gap-2">
								<span class="text-[11px] text-stone-500 dark:text-stone-400">Value target</span>
								<span class="truncate text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
									{#if value.actual === null}
										{fmtMoney(value.target, value.currency)} · rate unavailable
									{:else}
										{fmtMoney(value.actual, value.currency)} of {fmtMoney(value.target, value.currency)}
									{/if}
								</span>
							</div>
							{#if value.pct === null}
								<p class="mt-0.5 text-[11px] text-stone-400 dark:text-stone-500">
									No {value.currency} rate available.
								</p>
							{:else}
								<div
									class="relative mt-1 h-1 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800"
									role="img"
									aria-label="{c.label} {value.pct.toFixed(1)} percent of the value target"
								>
									<div
										class="absolute inset-y-0 left-0 rounded-full {value.pct >= 100 ? 'bg-emerald-500' : 'bg-stone-400 dark:bg-stone-500'}"
										style="width: {Math.min(100, Math.max(0, value.pct))}%"
									></div>
								</div>
								<p class="mt-0.5 text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
									{value.pct.toFixed(1)}% of target ·
									{#if (value.gap ?? 0) >= 0}
										{fmtMoney(value.gap ?? 0, value.currency)} to go
									{:else}
										{fmtMoney(-(value.gap ?? 0), value.currency)} over
									{/if}
								</p>
							{/if}
						</div>
					{/if}
					{#if assetsByCategory[c.key].length > 0}
						<ul class="mt-1 space-y-0.5 pl-3">
							{#each assetsByCategory[c.key] as h (h.id)}
								<li class="flex items-baseline justify-between gap-2">
									<span class="truncate text-[11px] text-stone-500 dark:text-stone-400">
										{h.category === 'cash' ? h.bank || h.ticker : h.ticker}{h.category === 'cash' && h.country ? ` · ${h.country}` : ''}
									</span>
									<span class="shrink-0 text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
										{fmtUsd(h.valueUsd ?? 0)} · {categoryUsd > 0 ? (((h.valueUsd ?? 0) / categoryUsd) * 100).toFixed(1) : '0.0'}%
									</span>
								</li>
							{/each}
						</ul>
					{/if}
				</li>
			{/each}
		</ul>
		{#if summary.goals === null}
			<p class="mt-3 text-[11px] leading-snug text-stone-500 dark:text-stone-400">No goals configured — tap Total USD to set them.</p>
		{/if}
	</div>
</div>
