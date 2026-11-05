<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import type { HoldingsSummary, HoldingCategory } from '$lib/types';

	// Goals editor. Allocation percentages stay a three-way split that must
	// add up to 100; value targets are optional and independent, so a category
	// can have both a share and an absolute amount.
	type Props = {
		summary: HoldingsSummary;
		onSave: (
			pct: { btc: number; fii: number; cash: number },
			values: { btc: number | null; fii: number | null; cash: number | null }
		) => Promise<boolean>;
		onClose: () => void;
	};
	let { summary, onSave, onClose }: Props = $props();

	const CATEGORIES: { key: HoldingCategory; label: string; symbol: string; currency: string }[] = [
		{ key: 'btc', label: 'Bitcoin', symbol: '$', currency: 'USD' },
		{ key: 'fii', label: 'FII investments', symbol: 'R$', currency: 'BRL' },
		{ key: 'cash', label: 'Bank / cash', symbol: 'R$', currency: 'BRL' }
	];

	// Initial drafts read the props once, when the modal opens.
	function seedPct(): Record<HoldingCategory, string> {
		const g = summary.goals ?? { btc: 50, fii: 20, cash: 30 };
		return { btc: String(g.btc), fii: String(g.fii), cash: String(g.cash) };
	}

	function seedValues(): Record<HoldingCategory, string> {
		const read = (g: { amount: number } | null | undefined) => (g ? String(g.amount) : '');
		return {
			btc: read(summary.valueGoals?.btc),
			fii: read(summary.valueGoals?.fii),
			cash: read(summary.valueGoals?.cash)
		};
	}

	let pctDraft = $state<Record<HoldingCategory, string>>(seedPct());
	let valueDraft = $state<Record<HoldingCategory, string>>(seedValues());
	let saving = $state(false);
	let error = $state('');

	const formField =
		'w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2 text-base text-stone-800 dark:text-stone-200 outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-stone-400 dark:focus:border-stone-600';

	function num(raw: string): number {
		return Number(raw.trim().replace(',', '.'));
	}

	async function submit() {
		if (saving) return;
		const pct = { btc: num(pctDraft.btc), fii: num(pctDraft.fii), cash: num(pctDraft.cash) };
		if (![pct.btc, pct.fii, pct.cash].every((v) => Number.isFinite(v) && v >= 0 && v <= 100)) {
			error = 'Each allocation goal is a percent from 0 to 100.';
			return;
		}
		if (Math.abs(pct.btc + pct.fii + pct.cash - 100) > 1e-9) {
			error = 'Allocation goals must add up to 100.';
			return;
		}
		const values: { btc: number | null; fii: number | null; cash: number | null } = {
			btc: null,
			fii: null,
			cash: null
		};
		for (const c of CATEGORIES) {
			const raw = valueDraft[c.key].trim();
			if (raw === '') continue;
			const v = num(raw);
			if (!Number.isFinite(v) || v <= 0) {
				error = 'Value targets must be empty or greater than 0.';
				return;
			}
			values[c.key] = v;
		}
		saving = true;
		error = '';
		const ok = await onSave(pct, values);
		saving = false;
		if (ok) onClose();
		else error = 'Could not save the goals.';
	}
</script>

<div
	class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 dark:bg-black/60 backdrop-blur-md p-4"
	role="dialog"
	aria-modal="true"
	aria-label="Goals"
	tabindex="-1"
	onclick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
	onkeydown={(e) => {
		if (e.key === 'Escape' && !saving) onClose();
	}}
	transition:fade={{ duration: motionMs(BACKDROP_MS) }}
>
	<div
		class="flex max-h-[85dvh] w-full max-w-sm flex-col rounded-2xl bg-white dark:bg-stone-900 p-5 shadow-xl"
		transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}
	>
		<div class="flex items-start justify-between gap-2">
			<div class="min-w-0">
				<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">Goals</h2>
				<p class="mt-0.5 text-[11px] leading-snug text-stone-500 dark:text-stone-400">
					Allocation and value targets are independent.
				</p>
			</div>
			<button
				type="button"
				class="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg leading-none text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300"
				aria-label="Close"
				onclick={onClose}
			>&times;</button>
		</div>

		<form
			class="mt-3 flex min-h-0 flex-1 flex-col"
			onsubmit={(e) => {
				e.preventDefault();
				void submit();
			}}
		>
			<div class="min-h-0 flex-1 overflow-y-auto pr-1">
				<section>
					<h3 class="text-xs font-semibold text-stone-700 dark:text-stone-300">Allocation</h3>
					<p class="mt-0.5 text-[11px] leading-snug text-stone-500 dark:text-stone-400">
						Share of the total. Must add up to 100%.
					</p>
					{#each CATEGORIES as c (c.key)}
						<label class="mt-2 flex items-center gap-2">
							<span class="w-24 shrink-0 text-xs text-stone-600 dark:text-stone-400">{c.label}</span>
							<div class="relative min-w-0 flex-1">
								<input
									class="{formField} pr-7"
									aria-label="{c.label} allocation percent"
									value={pctDraft[c.key]}
									oninput={(e) => (pctDraft = { ...pctDraft, [c.key]: e.currentTarget.value })}
									inputmode="decimal"
									autocomplete="off"
								/>
								<span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-stone-400 dark:text-stone-500">%</span>
							</div>
						</label>
					{/each}
				</section>

				<section class="mt-4 border-t border-stone-200 pt-3 dark:border-stone-800">
					<h3 class="text-xs font-semibold text-stone-700 dark:text-stone-300">Value targets</h3>
					<p class="mt-0.5 text-[11px] leading-snug text-stone-500 dark:text-stone-400">
						Optional. Each target is independent from the percentages.
					</p>
					{#each CATEGORIES as c (c.key)}
						<label class="mt-2 flex items-center gap-2">
							<span class="w-24 shrink-0 text-xs text-stone-600 dark:text-stone-400">{c.label}</span>
							<div class="relative min-w-0 flex-1">
								<span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-stone-400 dark:text-stone-500">{c.symbol}</span>
								<input
									class="{formField} pl-9"
									aria-label="{c.label} value target in {c.currency}"
									placeholder="No target"
									value={valueDraft[c.key]}
									oninput={(e) => (valueDraft = { ...valueDraft, [c.key]: e.currentTarget.value })}
									inputmode="decimal"
									autocomplete="off"
								/>
							</div>
						</label>
					{/each}
				</section>

				{#if error}
					<p class="mt-2 text-xs text-rose-600 dark:text-rose-400" role="alert">{error}</p>
				{/if}
			</div>

			<div class="mt-3 flex shrink-0 justify-end gap-2">
				<button
					type="button"
					class="rounded-full border border-stone-200 px-4 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
					disabled={saving}
					onclick={onClose}
				>Cancel</button>
				<button
					type="submit"
					class="rounded-full bg-stone-900 px-4 py-1.5 text-xs font-medium whitespace-nowrap text-white hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-700 dark:hover:bg-stone-600"
					disabled={saving}
				>{saving ? 'Saving…' : 'Save'}</button>
			</div>
		</form>
	</div>
</div>
