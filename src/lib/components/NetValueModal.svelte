<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import { fmtCurrency } from '$lib/currency';
	import type { TradingPosition } from '$lib/types';

	// What the big card number means: the net cash a sale at the latest
	// quote would actually yield — never the invested cost, never the goal.
	type Props = { p: TradingPosition; onClose: () => void };
	let { p, onClose }: Props = $props();

	const gross = $derived(p.quote === null ? null : p.qty * p.quote);

	// The card that opens this modal is itself clickable: every close path
	// must stop here, or the click keeps bubbling and opens the card's
	// detail modal right behind this one.
	function dismiss(e: Event) {
		e.stopPropagation();
		onClose();
	}
	function pct(v: number): string {
		return `${v.toLocaleString('pt-BR', { maximumFractionDigits: 3 })} %`;
	}
</script>

<div
	class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 dark:bg-black/60 backdrop-blur-md p-4"
	role="dialog"
	aria-modal="true"
	aria-label="About this value"
	tabindex="-1"
	onclick={(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}
	onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Escape') onClose(); }}
	transition:fade={{ duration: motionMs(BACKDROP_MS) }}
>
	<div
		class="w-full max-w-xs rounded-2xl bg-white dark:bg-stone-900 p-5 shadow-xl"
		transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}
	>
		<div class="flex items-start justify-between gap-2">
			<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">The big number</h2>
			<button
				type="button"
				class="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg leading-none text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300"
				aria-label="Close"
				onclick={dismiss}
			>&times;</button>
		</div>
		<p class="mt-2 text-sm leading-snug text-stone-700 dark:text-stone-300">
			The net cash you would actually receive for selling the whole position right now.
		</p>
		{#if gross !== null && p.netValue !== null}
			{@const f = p.sellFees}
			<p class="mt-2 rounded-xl bg-stone-100 dark:bg-stone-800 px-3 py-2 text-[11px] tabular-nums leading-relaxed text-stone-600 dark:text-stone-300">
				{fmtCurrency(gross, 'BRL', 2)} at market<br />
				− {fmtCurrency(f?.fee ?? 0, 'BRL', 2)} B3 fee ({pct(f?.feeRatePct ?? 0)})<br />
				− {fmtCurrency(f?.irrf ?? 0, 'BRL', 2)} dedo-duro ({pct(f?.irrfRatePct ?? 0)}){#if (f?.fixed ?? 0) > 0}<br />− {fmtCurrency(f?.fixed ?? 0, 'BRL', 2)} fixed fee{/if}<br />
				= <strong>{fmtCurrency(p.netValue, 'BRL', 2)} net</strong>
			</p>
		{/if}
		<ul class="mt-2 list-disc space-y-1 pl-5 text-[11px] leading-snug text-stone-500 dark:text-stone-400">
			<li>Sell costs are the venue's B3 fee, dedo-duro and fixed fee.</li>
			<li>It is not your invested cost — see the avg and cost lines.</li>
			<li>It is not the goal — see the goal and Δ lines.</li>
			<li>Profit = net − cost.</li>
		</ul>
		<div class="mt-4 flex justify-end">
			<button
				type="button"
				class="rounded-full bg-stone-900 dark:bg-stone-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-stone-800 dark:hover:bg-stone-600"
				onclick={dismiss}
			>Got it</button>
		</div>
	</div>
</div>
