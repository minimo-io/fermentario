<script lang="ts">
	import { onMount } from 'svelte';
	import type { TimeTrackerStats } from '$lib/types';
	import { tagColors } from '$lib/tag-colors.svelte';
	import ChevronLeft from '@lucide/svelte/icons/chevron-left';
	import ChevronRight from '@lucide/svelte/icons/chevron-right';

	type Period = 'month' | 'week' | 'year';

	type Props = { revision?: number };
	let { revision = 0 }: Props = $props();

	let period = $state<Period>('month');
	let anchor = $state(Date.now());
	let stats = $state<TimeTrackerStats | null>(null);
	let loading = $state(false);

	const PALETTE = ['amber', 'sky', 'emerald', 'rose', 'violet'] as const;

	function fallbackKey(tag: string): string {
		let h = 0;
		for (let i = 0; i < tag.length; i++) h = (h * 31 + tag.charCodeAt(i)) | 0;
		return PALETTE[Math.abs(h) % PALETTE.length] ?? 'amber';
	}

	function segmentClass(tag: string): string {
		if (!tag) return 'bg-stone-300 dark:bg-stone-600';
		const key = tagColors.colors[tag] ?? fallbackKey(tag);
		const map: Record<string, string> = {
			gray: 'bg-stone-400 dark:bg-stone-500',
			amber: 'bg-amber-400 dark:bg-amber-600',
			emerald: 'bg-emerald-400 dark:bg-emerald-600',
			sky: 'bg-sky-400 dark:bg-sky-600',
			rose: 'bg-rose-400 dark:bg-rose-600',
			violet: 'bg-violet-400 dark:bg-violet-600'
		};
		return map[key] ?? map.amber;
	}

	function fmtDuration(ms: number): string {
		const m = Math.round(ms / 60000);
		if (m < 60) return `${m}m`;
		const h = Math.floor(m / 60);
		const rm = m % 60;
		return rm ? `${h}h ${rm}m` : `${h}h`;
	}

	function periodKey(): string {
		return 'fermentario.timeTrackerPeriod';
	}

	async function load() {
		loading = true;
		try {
			const at = new Date(anchor).toISOString();
			const res = await fetch(`/api/time-tracker/stats?period=${period}&at=${encodeURIComponent(at)}`);
			if (!res.ok) return;
			stats = (await res.json()) as TimeTrackerStats;
		} finally {
			loading = false;
		}
	}

	function shift(dir: -1 | 1) {
		const d = new Date(anchor);
		if (period === 'month') d.setMonth(d.getMonth() + dir);
		else if (period === 'week') d.setDate(d.getDate() + dir * 7);
		else d.setFullYear(d.getFullYear() + dir);
		anchor = d.getTime();
	}

	function setPeriod(p: Period) {
		period = p;
		try { localStorage.setItem(periodKey(), p); } catch {}
	}

	onMount(() => {
		void tagColors.load();
		try {
			const p = localStorage.getItem(periodKey());
			if (p === 'month' || p === 'week' || p === 'year') period = p;
		} catch {}
		void load();
	});

	$effect(() => {
		period;
		anchor;
		revision;
		void load();
	});

	const maxTotal = $derived(stats ? Math.max(1, ...stats.buckets.map((b) => b.totalMs)) : 1);
	const legendTags = $derived.by(() => {
		if (!stats) return [] as string[];
		const seen = new Set<string>();
		const out: string[] = [];
		for (const b of stats.buckets) {
			for (const s of b.segments) {
				if (!s.tag || seen.has(s.tag)) continue;
				seen.add(s.tag);
				out.push(s.tag);
			}
		}
		return out.sort();
	});
	const hasUntagged = $derived(stats?.buckets.some((b) => b.segments.some((s) => !s.tag && s.ms > 0)) ?? false);
</script>

<section class="mb-6 rounded-2xl border border-stone-200 bg-white px-4 py-4 dark:border-stone-800 dark:bg-stone-900">
	<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
		<h2 class="text-xs font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500">Time by project</h2>
		<div class="flex items-center gap-1 rounded-full border border-stone-200 bg-stone-50 p-0.5 dark:border-stone-700 dark:bg-stone-800">
			{#each (['week','month','year'] as const) as p}
				<button
					type="button"
					class="rounded-full px-2.5 py-1 text-[11px] font-medium {period === p ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-stone-100' : 'text-stone-500 hover:text-stone-700 dark:text-stone-400'}"
					onclick={() => setPeriod(p)}
				>{p[0].toUpperCase() + p.slice(1)}</button>
			{/each}
		</div>
	</div>

	<div class="mb-3 flex items-center justify-between gap-2">
		<button type="button" class="grid h-7 w-7 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800" aria-label="Previous period" onclick={() => shift(-1)}><ChevronLeft class="h-4 w-4" /></button>
		<p class="text-sm font-medium text-stone-700 dark:text-stone-200">{stats?.label ?? '…'}</p>
		<button type="button" class="grid h-7 w-7 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800" aria-label="Next period" onclick={() => shift(1)}><ChevronRight class="h-4 w-4" /></button>
	</div>

	{#if loading && !stats}
		<p class="py-8 text-center text-sm text-stone-500 dark:text-stone-400">Loading…</p>
	{:else if stats}
		<div class="overflow-x-auto pb-1">
			<div class="flex h-40 items-end gap-1 {period === 'month' ? 'min-w-[28rem]' : ''}">
				{#each stats.buckets as b (b.key)}
					<div class="group relative flex min-w-0 flex-1 flex-col items-center gap-1">
						<div class="flex h-32 w-full max-w-8 flex-col-reverse overflow-hidden rounded-sm bg-stone-100 dark:bg-stone-800" title="{b.label}: {fmtDuration(b.totalMs)}">
							{#if b.totalMs > 0}
								{#each b.segments as s}
									<div class="{segmentClass(s.tag)}" style="height: {(s.ms / maxTotal) * 100}%"></div>
								{/each}
							{/if}
						</div>
						<span class="text-[10px] tabular-nums text-stone-400 dark:text-stone-500">{b.label}</span>
					</div>
				{/each}
			</div>
		</div>

		{#if legendTags.length > 0 || hasUntagged}
			<div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-stone-500 dark:text-stone-400">
				{#each legendTags as tag (tag)}
					<span class="inline-flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm {segmentClass(tag)}"></span>#{tag}</span>
				{/each}
				{#if hasUntagged}
					<span class="inline-flex items-center gap-1.5"><span class="h-2.5 w-2.5 rounded-sm bg-stone-300 dark:bg-stone-600"></span>untagged</span>
				{/if}
			</div>
		{/if}

		{#if stats.buckets.every((b) => b.totalMs === 0)}
			<p class="mt-2 text-center text-sm text-stone-500 dark:text-stone-400">No tracked time in this period.</p>
		{/if}
	{/if}
</section>
