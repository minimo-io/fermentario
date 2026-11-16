<script lang="ts">
	import { fmtCurrency } from '$lib/currency';

	// Minimal SVG line chart for daily values. No dependency; the viewBox
	// scales to the card width and the stroke stays 1.5px.
	type Point = { day: string; value: number };
	type Props = {
		points: Point[];
		currency: string;
	};
	let { points, currency }: Props = $props();

	const W = 320;
	const H = 96;
	const PAD = 6;

	const clean = $derived(points.filter((p) => Number.isFinite(p.value)));
	const values = $derived(clean.map((p) => p.value));
	const min = $derived(values.length > 0 ? Math.min(...values) : 0);
	const max = $derived(values.length > 0 ? Math.max(...values) : 0);
	const span = $derived(max - min || 1);
	const dayMs = $derived.by(() => {
		const times = clean.map((p) => new Date(`${p.day}T12:00:00`).getTime());
		return times.length > 0 ? times : [0];
	});
	const timeSpan = $derived(Math.max(...dayMs) - Math.min(...dayMs) || 1);
	const coords = $derived(
		clean.map((p, i) => {
			const x = PAD + ((dayMs[i]! - Math.min(...dayMs)) / timeSpan) * (W - PAD * 2);
			const y = H - PAD - ((p.value - min) / span) * (H - PAD * 2);
			return { x, y };
		})
	);
	const line = $derived(coords.map((c) => `${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' '));
	const area = $derived(
		coords.length > 0
			? `M ${coords[0]!.x.toFixed(1)} ${H} L ${coords.map((c) => `${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(' L ')} L ${coords[coords.length - 1]!.x.toFixed(1)} ${H} Z`
			: ''
	);
	const first = $derived(clean[0]?.day ?? '');
	const last = $derived(clean[clean.length - 1]?.day ?? '');
	const firstValue = $derived(clean[0]?.value ?? 0);
	const lastValue = $derived(clean[clean.length - 1]?.value ?? 0);
	const change = $derived(
		clean.length > 1 && clean[0]!.value !== 0
			? ((lastValue - clean[0]!.value) / Math.abs(clean[0]!.value)) * 100
			: null
	);
	const spanDays = $derived(
		clean.length > 1
			? Math.max(1, Math.round((new Date(`${last}T12:00:00`).getTime() - new Date(`${first}T12:00:00`).getTime()) / 86400000))
			: 0
	);

	function money(v: number): string {
		return fmtCurrency(v, currency, Math.abs(v) >= 1000 ? 0 : 2);
	}

	function dayLabel(day: string): string {
		if (!day) return '';
		const d = new Date(`${day}T12:00:00`);
		return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: '2-digit' });
	}
</script>

{#if clean.length < 2}
	<p class="rounded-xl border border-dashed border-stone-200 dark:border-stone-800 px-3 py-6 text-center text-[11px] text-stone-400 dark:text-stone-500">
		{clean.length === 1 ? 'One day recorded — the line appears after the next snapshot.' : 'No value history yet.'}
	</p>
{:else}
	<div class="rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3">
		<div class="flex items-start justify-between gap-2">
			<span class="pt-0.5 text-xs tabular-nums text-stone-400 dark:text-stone-500">{money(firstValue)}</span>
			<span class="text-right">
				<span class="block text-sm font-semibold tabular-nums text-stone-800 dark:text-stone-200">{money(lastValue)}</span>
				{#if change !== null}
					<span class="mt-0.5 block text-[11px] font-medium tabular-nums {change >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
						{change >= 0 ? '+' : ''}{change.toFixed(1)}% over {spanDays} {spanDays === 1 ? 'day' : 'days'}
					</span>
				{/if}
			</span>
		</div>
		<svg viewBox="0 0 {W} {H}" class="mt-1 h-24 w-full overflow-visible" role="img" aria-label="Value history">
			<path d={area} fill="currentColor" class="text-stone-200/70 dark:text-stone-800/70"></path>
			<polyline
				points={line}
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
				class="text-stone-700 dark:text-stone-300"
			></polyline>
			{#each coords as c, i (i)}
				<circle
					cx={c.x}
					cy={c.y}
					r={i === coords.length - 1 ? 3 : 2}
					fill="currentColor"
					class={i === coords.length - 1 ? 'text-stone-900 dark:text-stone-100' : 'text-stone-400 dark:text-stone-500'}
				/>
			{/each}
		</svg>
		<div class="flex justify-between text-[10px] tabular-nums text-stone-400 dark:text-stone-500">
			<span>{dayLabel(first)}</span>
			<span>{dayLabel(last)}</span>
		</div>
	</div>
{/if}
