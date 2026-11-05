<script lang="ts">
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { contentWidthClass } from '$lib/display';
	import DoneTasks from '$lib/components/DoneTasks.svelte';
	import TradeHistory from '$lib/components/TradeHistory.svelte';
	import type { TodoDonePage, TradeDay, TradeHistoryPage } from '$lib/types';

	type View = 'notes' | 'trades';

	type Props = {
		data: {
			days: { day: string; count: number }[];
			trades: TradeDay[];
			notes: number;
			done: TodoDonePage;
			tradeHistory: TradeHistoryPage;
		};
	};
	let { data }: Props = $props();

	let lang = $state('en');
	let contentClass = $state('max-w-2xl');
	onMount(() => {
		try {
			const raw = localStorage.getItem('fermentario.config');
			if (raw) {
				const c = JSON.parse(raw) as { entriesLang?: string; contentWidth?: string };
				if (c?.entriesLang) lang = c.entriesLang;
				contentClass = contentWidthClass(c?.contentWidth);
			}
		} catch {}
	});

	// Notes and investments are two different questions. One square cannot
	// carry three intensities, so each view gets its own scale and history.
	let view = $state<View>('notes');
	let viewStored = $state(false);
	onMount(() => {
		try {
			const raw = localStorage.getItem('fermentario.heatmapView');
			if (raw === 'notes' || raw === 'trades') view = raw;
		} catch {}
		viewStored = true;
	});
	$effect(() => {
		if (viewStored) {
			try {
				localStorage.setItem('fermentario.heatmapView', view);
			} catch {}
		}
	});

	const counts = $derived(new Map(data.days.map((d) => [d.day, d.count])));
	const tradeCounts = $derived(new Map(data.trades.map((t) => [t.day, t])));
	const maxCount = $derived(data.days.reduce((m, d) => Math.max(m, d.count), 0));
	const maxBuys = $derived(data.trades.reduce((m, t) => Math.max(m, t.buys), 0));
	const maxSells = $derived(data.trades.reduce((m, t) => Math.max(m, t.sells), 0));

	const today = new Date();
	const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(
		today.getDate()
	).padStart(2, '0')}`;

	const years = $derived([
		...new Set([
			...data.days.map((d) => Number(d.day.slice(0, 4))),
			...data.trades.map((t) => Number(t.day.slice(0, 4))),
			today.getFullYear()
		])
	].sort((a, b) => a - b));

	let year = $state(today.getFullYear());
	let stored = $state(false);
	onMount(() => {
		const raw = localStorage.getItem('fermentario.heatmapYear');
		const y = Number(raw);
		if (raw && years.includes(y)) year = y;
		stored = true;
	});
	$effect(() => {
		if (stored) localStorage.setItem('fermentario.heatmapYear', String(year));
	});

	interface Cell {
		key: string;
		date: Date;
		count: number;
		buys: number;
		sells: number;
		future: boolean;
	}

	const yearDays = $derived(data.days.filter((d) => d.day.slice(0, 4) === String(year)));
	const yearNotes = $derived(yearDays.reduce((sum, d) => sum + d.count, 0));
	const yearActiveDays = $derived(yearDays.length);
	const yearBusiest = $derived(
		yearDays.reduce<{ day: string; count: number } | null>(
			(best, d) => (d.count > (best?.count ?? 0) ? d : best),
			null
		)
	);

	const yearTrades = $derived(data.trades.filter((t) => t.day.slice(0, 4) === String(year)));
	const yearBuys = $derived(yearTrades.reduce((sum, t) => sum + t.buys, 0));
	const yearSells = $derived(yearTrades.reduce((sum, t) => sum + t.sells, 0));
	const yearTradeDays = $derived(yearTrades.length);
	const yearBusiestTrade = $derived(
		yearTrades.reduce<{ day: string; total: number } | null>((best, t) => {
			const total = t.buys + t.sells;
			return total > (best?.total ?? 0) ? { day: t.day, total } : best;
		}, null)
	);

	/** One rectangle for the year: the days in reverse calendar order, seven per
	 *  column, starting flush at the top left with 31 December. Calendar-weekday
	 *  alignment is deliberately dropped: it needs the first column to start with
	 *  days from January, which left a cut-out corner. A year is not a multiple
	 *  of seven, so the last column is short and the slack sits at the bottom
	 *  right. The label array holds one month name per month, in the first column
	 *  of that month in reading order, which is what aligns the row above. */
	const grid = $derived.by(() => {
		const days: Cell[] = [];
		const cursor = new Date(year, 0, 1);
		const lastDay = new Date(year, 11, 31);
		while (cursor <= lastDay) {
			const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, '0')}-${String(
				cursor.getDate()
			).padStart(2, '0')}`;
			const trade = tradeCounts.get(key);
			days.push({
				key,
				date: new Date(cursor),
				count: counts.get(key) ?? 0,
				buys: trade?.buys ?? 0,
				sells: trade?.sells ?? 0,
				future: key > todayKey
			});
			cursor.setDate(cursor.getDate() + 1);
		}
		// Newest first, so December sits on the left and January on the right.
		days.reverse();

		const columns: (Cell | null)[][] = [];
		const labels: (string | null)[] = [];
		let labelled = -1;
		for (let i = 0; i < days.length; i += 7) {
			const column = days.slice(i, i + 7);
			columns.push(column);
			let label: string | null = null;
			for (const cell of column) {
				if (cell.date.getMonth() !== labelled) {
					labelled = cell.date.getMonth();
					label = cell.date.toLocaleDateString(lang, { month: 'short' });
					break;
				}
			}
			labels.push(label);
		}
		return { columns, labels };
	});

	function shadeNotes(cell: Cell): string {
		// One style for every day without notes, past or not yet reached, so the
		// grid reads as a single uniform block. Only real counts get colour.
		if (cell.count <= 0) return 'bg-stone-200 dark:bg-stone-700';
		if (maxCount <= 1) return 'bg-amber-400 dark:bg-amber-600';
		const ratio = cell.count / maxCount;
		if (ratio <= 0.25) return 'bg-amber-200 dark:bg-amber-900';
		if (ratio <= 0.5) return 'bg-amber-300 dark:bg-amber-800';
		if (ratio <= 0.75) return 'bg-amber-400 dark:bg-amber-600';
		return 'bg-amber-500';
	}

	// Four bands per side, like the note scale. A day with one event on a
	// one-event maximum uses band 3, matching the notes' single-event shade.
	function band(n: number, max: number): number {
		if (n <= 0) return 0;
		if (max <= 1) return 3;
		const ratio = n / max;
		if (ratio <= 0.25) return 1;
		if (ratio <= 0.5) return 2;
		if (ratio <= 0.75) return 3;
		return 4;
	}

	const BUY_CLASS = ['', 'bg-emerald-200 dark:bg-emerald-900', 'bg-emerald-300 dark:bg-emerald-800', 'bg-emerald-400 dark:bg-emerald-600', 'bg-emerald-500'] as const;
	const SELL_CLASS = ['', 'bg-rose-200 dark:bg-rose-900', 'bg-rose-300 dark:bg-rose-800', 'bg-rose-400 dark:bg-rose-600', 'bg-rose-500'] as const;
	const TRADE_BASE = 'bg-stone-200 dark:bg-stone-700';
	const BUY_RGB = '16, 185, 129';
	const SELL_RGB = '244, 63, 94';
	const BAND_ALPHA = [0, 0.3, 0.5, 0.7, 1] as const;

	function tradeClass(cell: Cell): string {
		const b = band(cell.buys, maxBuys);
		const s = band(cell.sells, maxSells);
		if (b > 0 && s > 0) return TRADE_BASE;
		if (b > 0) return BUY_CLASS[b];
		if (s > 0) return SELL_CLASS[s];
		return TRADE_BASE;
	}

	/** A day with both sides splits diagonally. The alpha carries the
	 *  intensity over the neutral base, so it reads in both themes. */
	function tradeStyle(cell: Cell): string | undefined {
		const b = band(cell.buys, maxBuys);
		const s = band(cell.sells, maxSells);
		if (b === 0 || s === 0) return undefined;
		return `background-image: linear-gradient(135deg, rgba(${BUY_RGB}, ${BAND_ALPHA[b]}) 50%, rgba(${SELL_RGB}, ${BAND_ALPHA[s]}) 50%)`;
	}

	let tip = $state<{ x: number; y: number; text: string } | null>(null);

	function cellText(cell: Cell): string {
		if (view === 'trades') {
			const parts: string[] = [];
			if (cell.buys > 0) parts.push(`${cell.buys} ${cell.buys === 1 ? 'buy' : 'buys'}`);
			if (cell.sells > 0) parts.push(`${cell.sells} ${cell.sells === 1 ? 'sell' : 'sells'}`);
			return parts.length > 0 ? parts.join(' · ') : 'no trades';
		}
		return `${cell.count} ${cell.count === 1 ? 'note' : 'notes'}`;
	}

	function showTip(e: { clientX: number; clientY: number }, cell: Cell) {
		const when = cell.date.toLocaleDateString(lang, {
			weekday: 'short',
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
		tip = {
			x: e.clientX,
			y: e.clientY,
			text: cell.future ? `${when} — not yet` : `${when} — ${cellText(cell)}${cell.key === todayKey ? ' · today' : ''}`
		};
	}
</script>

<svelte:head>
	<title>Heatmaps · fermentario</title>
</svelte:head>

<main class="min-h-dvh">
	<div class="mx-auto {contentClass} px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-24">
		<header class="mb-6">
			<button
				type="button"
				class="inline-flex items-center gap-1 text-xs font-medium text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200"
				onclick={() => { if (window.history.length > 1) window.history.back(); else goto('/'); }}
			>
				<ArrowLeft class="h-3.5 w-3.5" /> Back
			</button>
			<h1 class="mt-3 text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">Heatmaps</h1>
		</header>

		<div class="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Heatmap view">
			<button
				type="button"
				role="tab"
				aria-selected={view === 'notes'}
				class="rounded-full border px-3 py-1 text-xs font-medium {view === 'notes'
					? 'border-stone-900 dark:border-stone-700 bg-stone-900 dark:bg-stone-700 text-white'
					: 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'}"
				onclick={() => (view = 'notes')}
			>Notes &amp; tasks</button>
			<button
				type="button"
				role="tab"
				aria-selected={view === 'trades'}
				class="rounded-full border px-3 py-1 text-xs font-medium {view === 'trades'
					? 'border-stone-900 dark:border-stone-700 bg-stone-900 dark:bg-stone-700 text-white'
					: 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'}"
				onclick={() => (view = 'trades')}
			>Investments</button>
		</div>

		{#if view === 'notes'}
			<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">
				{yearNotes}
				{yearNotes === 1 ? 'note' : 'notes'} in {year}, across {yearActiveDays}
				{yearActiveDays === 1 ? 'day' : 'days'}
				{#if yearBusiest && yearBusiest.count > 0}
					· busiest day {yearBusiest.count} on {yearBusiest.day}
				{/if}
				· {data.notes} in total
			</p>
		{:else}
			<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">
				{yearBuys} {yearBuys === 1 ? 'buy' : 'buys'} · {yearSells}
				{yearSells === 1 ? 'sell' : 'sells'} in {year}, across {yearTradeDays}
				{yearTradeDays === 1 ? 'day' : 'days'}
				{#if yearBusiestTrade}
					· busiest day {yearBusiestTrade.total} {yearBusiestTrade.total === 1 ? 'trade' : 'trades'} on {yearBusiestTrade.day}
				{/if}
			</p>
		{/if}

		{#if view === 'notes' ? data.notes > 0 : data.trades.length > 0}
			{#if years.length > 1}
				<div class="mb-4 mt-3 flex flex-wrap gap-2">
					{#each years as y (y)}
						<button
							type="button"
							class="rounded-full border px-3 py-1 text-xs font-medium {y === year
								? 'border-stone-900 dark:border-stone-700 bg-stone-900 dark:bg-stone-700 text-white'
								: 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'}"
							onclick={() => (year = y)}
						>{y}</button>
					{/each}
				</div>
			{/if}

			<div class="overflow-x-auto pb-1">
				<div class="w-max">
					<div class="mb-1 flex gap-[3px] text-[10px] leading-3 text-stone-500 dark:text-stone-400">
						{#each grid.labels as label, i (i)}
							<span class="w-3 shrink-0 whitespace-nowrap">{label ?? ''}</span>
						{/each}
					</div>
					<div class="flex gap-[3px]">
						{#each grid.columns as column, ci (ci)}
							<div class="grid grid-rows-7 gap-[3px]">
								{#each column as cell}
									{#if cell}
										{@const isToday = cell.key === todayKey}
										<button
											type="button"
											tabindex="-1"
											class="h-3 w-3 cursor-default rounded-[2px] p-0 {view === 'notes' ? shadeNotes(cell) : tradeClass(cell)} {isToday ? 'ring-1 ring-stone-900/50 dark:ring-stone-100/50' : ''}"
											style={view === 'trades' ? tradeStyle(cell) : undefined}
											aria-label={cell.date.toLocaleDateString(lang, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ': ' + cellText(cell) + (isToday ? ' (today)' : '')}
											onmouseenter={(e) => showTip(e, cell)}
											onmouseleave={() => (tip = null)}
											onclick={(e) => showTip(e, cell)}
										></button>
									{:else}
										<span class="h-3 w-3"></span>
									{/if}
								{/each}
							</div>
						{/each}
					</div>
				</div>
			</div>

			{#if view === 'notes'}
				<div class="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-stone-400 dark:text-stone-500">
					<span>less</span>
					<span class="h-3 w-3 rounded-[2px] bg-stone-200 dark:bg-stone-700"></span>
					<span class="h-3 w-3 rounded-[2px] bg-amber-200 dark:bg-amber-900"></span>
					<span class="h-3 w-3 rounded-[2px] bg-amber-300 dark:bg-amber-800"></span>
					<span class="h-3 w-3 rounded-[2px] bg-amber-400 dark:bg-amber-600"></span>
					<span class="h-3 w-3 rounded-[2px] bg-amber-500"></span>
					<span>more</span>
					<span class="ml-1 h-3 w-3 rounded-[2px] bg-stone-200 dark:bg-stone-700 ring-1 ring-stone-900/50 dark:ring-stone-100/50"></span>
					<span>today</span>
					<span class="ml-3">Hover a square, or tap it, for that day's count.</span>
				</div>
			{:else}
				<div class="mt-4 space-y-1.5 text-[11px] text-stone-400 dark:text-stone-500">
					<div class="flex flex-wrap items-center gap-2">
						<span class="w-10">Buys</span>
						<span>less</span>
						<span class="h-3 w-3 rounded-[2px] bg-emerald-200 dark:bg-emerald-900"></span>
						<span class="h-3 w-3 rounded-[2px] bg-emerald-300 dark:bg-emerald-800"></span>
						<span class="h-3 w-3 rounded-[2px] bg-emerald-400 dark:bg-emerald-600"></span>
						<span class="h-3 w-3 rounded-[2px] bg-emerald-500"></span>
						<span>more</span>
					</div>
					<div class="flex flex-wrap items-center gap-2">
						<span class="w-10">Sells</span>
						<span>less</span>
						<span class="h-3 w-3 rounded-[2px] bg-rose-200 dark:bg-rose-900"></span>
						<span class="h-3 w-3 rounded-[2px] bg-rose-300 dark:bg-rose-800"></span>
						<span class="h-3 w-3 rounded-[2px] bg-rose-400 dark:bg-rose-600"></span>
						<span class="h-3 w-3 rounded-[2px] bg-rose-500"></span>
						<span>more</span>
					</div>
					<div class="flex flex-wrap items-center gap-2">
						<span class="w-10">Both</span>
						<span
							class="h-3 w-3 rounded-[2px] bg-stone-200 dark:bg-stone-700"
							style="background-image: linear-gradient(135deg, rgba(16, 185, 129, 1) 50%, rgba(244, 63, 94, 1) 50%)"
						></span>
						<span>buy and sell on the same day</span>
					</div>
					<div class="flex flex-wrap items-center gap-2">
						<span class="w-10"></span>
						<span class="h-3 w-3 rounded-[2px] bg-stone-200 dark:bg-stone-700 ring-1 ring-stone-900/50 dark:ring-stone-100/50"></span>
						<span>today</span>
						<span class="ml-3">Hover a square, or tap it, for that day's trades.</span>
					</div>
				</div>
			{/if}
		{:else}
			<p class="mt-3 rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 px-4 py-10 text-center text-sm text-stone-500 dark:text-stone-400">
				{#if view === 'notes'}
					No notes yet — the heatmap fills in as you write.
				{:else}
					No trades yet — record a buy or sell to fill this heatmap.
				{/if}
			</p>
		{/if}

		{#if view === 'notes'}
			<DoneTasks initial={data.done} {lang} />
		{:else}
			<TradeHistory initial={data.tradeHistory} {lang} />
		{/if}
	</div>
</main>

{#if tip}
	<div
		class="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-lg bg-stone-900 dark:bg-stone-700 px-2.5 py-1 text-[11px] text-white shadow-lg"
		style="left: {tip.x}px; top: {tip.y - 8}px"
	>{tip.text}</div>
{/if}
