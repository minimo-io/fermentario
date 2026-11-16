<script lang="ts">
	// Two-color year heatmap for Nostr activity: published notes (amber)
	// and replies (blue). Same grid layout as the Heatmaps page, with a
	// combined intensity and a hue that leans toward whichever series
	// dominated that day. Each cell's tooltip shows both counts.
	type DayCount = { day: string; count: number };
	type Props = {
		published: DayCount[];
		replies: DayCount[];
	};
	let { published, replies }: Props = $props();

	const today = new Date();
	const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

	const pubMap = $derived(new Map(published.map((d) => [d.day, d.count])));
	const repMap = $derived(new Map(replies.map((d) => [d.day, d.count])));
	const maxPub = $derived(published.reduce((m, d) => Math.max(m, d.count), 0));
	const maxRep = $derived(replies.reduce((m, d) => Math.max(m, d.count), 0));
	const maxTotal = $derived(Math.max(maxPub, maxRep, 1));

	const years = $derived([...new Set([...published, ...replies].map((d) => Number(d.day.slice(0, 4))))].sort((a, b) => a - b));
	let year = $state(today.getFullYear());
	$effect(() => { if (!years.includes(year) && years.length) year = years[years.length - 1]; });

	// Build the 7-row grid for the selected year (same logic as the
	// heatmap page: reverse calendar order, weeks of seven, 31 Dec start).
	const grid = $derived.by(() => {
		const y = year;
		const start = new Date(y, 0, 1);
		const end = new Date(y, 11, 31);
		const columns: ({ key: string; pub: number; rep: number } | null)[][] = [];
		let col: ({ key: string; pub: number; rep: number } | null)[] = [];
		let cursor = new Date(end);
		// Align the first column to start on a Sunday-ish layout by
		// padding the trailing short column at the bottom (matches the
		// existing heatmap's "slack at the bottom" decision).
		const totalDays = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
		const pad = (7 - (totalDays % 7)) % 7;
		for (let i = 0; i < pad; i++) col.push(null);
		for (let d = 0; d < totalDays; d++) {
			const dt = new Date(start.getTime() + d * 86400000);
			const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
			col.push({ key, pub: pubMap.get(key) ?? 0, rep: repMap.get(key) ?? 0 });
			if (col.length === 7) {
				columns.push(col);
				col = [];
			}
		}
		if (col.length) columns.push(col);
		// columns were built oldest-first; reverse to show newest last
		columns.reverse();
		return { columns };
	});

	function cellClass(cell: { pub: number; rep: number }): string {
		const total = cell.pub + cell.rep;
		if (total === 0) return 'bg-stone-200 dark:bg-stone-700';
		const intensity = Math.max(1, Math.ceil((total / maxTotal) * 4));
		const pubDom = cell.pub >= cell.rep;
		const palette = pubDom
			? ['bg-amber-200 dark:bg-amber-900', 'bg-amber-300 dark:bg-amber-800', 'bg-amber-400 dark:bg-amber-600', 'bg-amber-500']
			: ['bg-sky-200 dark:bg-sky-900', 'bg-sky-300 dark:bg-sky-800', 'bg-sky-400 dark:bg-sky-600', 'bg-sky-500'];
		return palette[intensity - 1] ?? palette[palette.length - 1];
	}

	let tip = $state<{ text: string } | null>(null);
	function cellText(cell: { pub: number; rep: number }): string {
		const parts = [];
		if (cell.pub) parts.push(`${cell.pub} published`);
		if (cell.rep) parts.push(`${cell.rep} ${cell.rep === 1 ? 'reply' : 'replies'}`);
		return parts.length ? parts.join(' · ') : 'no activity';
	}
</script>

<div class="w-full">
	{#if years.length > 1}
		<div class="mb-3 flex flex-wrap gap-2">
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
			<div class="flex gap-[3px]">
				{#each grid.columns as column, ci (ci)}
					<div class="grid grid-rows-7 gap-[3px]">
						{#each column as cell}
							{#if cell}
								<button
									type="button"
									tabindex="-1"
									class="h-3 w-3 cursor-default rounded-[2px] p-0 {cell.key === todayKey ? 'ring-1 ring-stone-900/50 dark:ring-stone-100/50' : ''} {cellClass(cell)}"
									aria-label={`${cell.key}: ${cellText(cell)}`}
									title={`${cell.key}: ${cellText(cell)}`}
									onclick={(e) => { e.preventDefault(); tip = { text: `${cell.key} — ${cellText(cell)}` }; setTimeout(() => (tip = null), 1500); }}
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

	<div class="mt-4 flex flex-wrap items-center gap-2 text-[11px] text-stone-400 dark:text-stone-500">
		<span>less</span>
		<span class="h-3 w-3 rounded-[2px] bg-stone-200 dark:bg-stone-700"></span>
		<span class="h-3 w-3 rounded-[2px] bg-amber-200 dark:bg-amber-900"></span>
		<span class="h-3 w-3 rounded-[2px] bg-amber-300 dark:bg-amber-800"></span>
		<span class="h-3 w-3 rounded-[2px] bg-amber-400 dark:bg-amber-600"></span>
		<span class="h-3 w-3 rounded-[2px] bg-amber-500"></span>
		<span>more · published notes (amber)</span>
		<span class="ml-3 h-3 w-3 rounded-[2px] bg-sky-200 dark:bg-sky-900"></span>
		<span class="h-3 w-3 rounded-[2px] bg-sky-300 dark:bg-sky-800"></span>
		<span class="h-3 w-3 rounded-[2px] bg-sky-400 dark:bg-sky-600"></span>
		<span class="h-3 w-3 rounded-[2px] bg-sky-500"></span>
		<span>more · replies (blue)</span>
	</div>

	{#if tip}
		<p class="mt-2 text-[11px] tabular-nums text-stone-500 dark:text-stone-400">{tip.text}</p>
	{/if}
</div>
