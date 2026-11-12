<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import type { QuoteFetchEntry } from '$lib/types';

	// What the shared quote system did lately: every Holdings and Trading
	// quote attempt lands here with its source, price or error. A stale card
	// can always explain itself.
	type Props = { onClose: () => void };
	let { onClose }: Props = $props();

	let entries = $state<QuoteFetchEntry[] | null>(null);
	let failed = $state(false);

	onMount(() => {
		void (async () => {
			try {
				const d = await (await fetch('/api/quotes/log?limit=100')).json();
				entries = Array.isArray(d.entries) ? d.entries : [];
			} catch {
				failed = true;
			}
		})();
	});

	function fmtTime(at: number): string {
		try {
			return new Date(at).toLocaleString(undefined, {
				day: 'numeric',
				month: 'short',
				hour: '2-digit',
				minute: '2-digit'
			});
		} catch {
			return '';
		}
	}
</script>

<div
	class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 dark:bg-black/60 backdrop-blur-md p-4"
	role="dialog"
	aria-modal="true"
	aria-label="Quote fetch history"
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
				<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">Quote fetches</h2>
				<p class="mt-0.5 text-[11px] leading-snug text-stone-500 dark:text-stone-400">
					Newest first. One row per attempt: Google first for B3 (intraday), Fundamentus fallback, Yahoo otherwise, Coinbase for BTC.
				</p>
			</div>
			<button
				type="button"
				class="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg leading-none text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300"
				aria-label="Close"
				onclick={onClose}
			>&times;</button>
		</div>

		<div class="mt-3 max-h-[60dvh] overflow-y-auto">
			{#if entries === null && !failed}
				<p class="py-6 text-center text-xs text-stone-400 dark:text-stone-500">Loading…</p>
			{:else if failed}
				<p class="py-6 text-center text-xs text-rose-600 dark:text-rose-400">Could not load the fetch history.</p>
			{:else if (entries ?? []).length === 0}
				<p class="py-6 text-center text-xs text-stone-400 dark:text-stone-500">No fetches logged yet.</p>
			{:else}
				<ul class="divide-y divide-stone-100 dark:divide-stone-800">
					{#each entries ?? [] as e, i (i)}
						<li class="flex items-start gap-2 py-2">
							<span
								class="mt-0.5 h-2 w-2 shrink-0 rounded-full {e.ok ? 'bg-emerald-500' : 'bg-rose-500'}"
								title={e.ok ? 'Success' : 'Failed'}
							></span>
							<div class="min-w-0 flex-1">
								<p class="text-xs font-semibold text-stone-800 dark:text-stone-200">
									{e.ticker} <span class="font-normal text-stone-400 dark:text-stone-500">· {e.source}</span>
									{#if e.ok && e.price !== null}
										<span class="font-normal tabular-nums"> · {e.price}</span>
									{/if}
								</p>
								{#if !e.ok && e.error}
									<p class="mt-0.5 text-[11px] text-rose-600 dark:text-rose-400">{e.error}</p>
								{/if}
								<p class="mt-0.5 text-[11px] tabular-nums text-stone-400 dark:text-stone-500">{fmtTime(e.fetched_at)}</p>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	</div>
</div>
