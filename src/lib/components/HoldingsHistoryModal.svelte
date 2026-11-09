<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import ValueChart from '$lib/components/ValueChart.svelte';
	import type { PortfolioValuePoint } from '$lib/types';

	// Daily portfolio total in USD. The server upserts one point per day,
	// keeping the last value fetched for that day.
	type Props = { onClose: () => void };
	let { onClose }: Props = $props();

	let points = $state<PortfolioValuePoint[] | null>(null);
	let failed = $state(false);

	onMount(() => {
		void (async () => {
			try {
				const d = await (await fetch('/api/holdings/history?days=365')).json();
				points = Array.isArray(d.points) ? d.points : [];
			} catch {
				failed = true;
			}
		})();
	});
</script>

<div
	class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 dark:bg-black/60 backdrop-blur-md p-4"
	role="dialog"
	aria-modal="true"
	aria-label="Portfolio value history"
	tabindex="-1"
	onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
	onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
	transition:fade={{ duration: motionMs(BACKDROP_MS) }}
>
	<div
		class="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl dark:bg-stone-900"
		transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}
	>
		<div class="flex items-start justify-between gap-2">
			<div class="min-w-0">
				<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">Portfolio value</h2>
				<p class="mt-0.5 text-[11px] leading-snug text-stone-500 dark:text-stone-400">
					One point per day, in USD. The last fetch of the day wins.
				</p>
			</div>
			<button
				type="button"
				class="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg leading-none text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300"
				aria-label="Close"
				onclick={onClose}
			>&times;</button>
		</div>

		<div class="mt-3">
			{#if points === null && !failed}
				<p class="py-6 text-center text-xs text-stone-400 dark:text-stone-500">Loading…</p>
			{:else if failed}
				<p class="py-6 text-center text-xs text-rose-600 dark:text-rose-400">Could not load the history.</p>
			{:else}
				<ValueChart points={(points ?? []).map((p) => ({ day: p.day, value: p.value_usd }))} currency="USD" />
			{/if}
		</div>
	</div>
</div>
