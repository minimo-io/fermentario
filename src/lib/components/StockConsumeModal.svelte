<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import { fmtQty, stockDisplayTitle, stockUnit, stockUnitFamily } from '$lib/stock';
	import type { StockItem } from '$lib/types';

	// Log one consumption. Amount is in the item's unit family; the server
	// converts it to packages and deducts that much, clamping at zero.
	type Props = {
		item: StockItem;
		onSubmit: (body: { amount: number; unit: string; note: string }) => Promise<{ ok: boolean; error?: string }>;
		onClose: () => void;
	};
	let { item, onSubmit, onClose }: Props = $props();

	const family = $derived(stockUnitFamily(item.package_unit));
	const unitOptions = $derived(family === 'volume' ? ['ml', 'L'] : ['g', 'kg']);
	const nativeUnit = $derived(stockUnit(item));

	let amount = $state('');
	// svelte-ignore state_referenced_locally
	let unit = $state(nativeUnit);
	let note = $state('');
	let saving = $state(false);
	let error = $state('');

	const formField =
		'min-w-0 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2 text-base text-stone-800 dark:text-stone-200 outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-stone-400 dark:focus:border-stone-600';

	function fill(quantity: number, u: string) {
		amount = String(Math.round(quantity * 100) / 100);
		unit = u;
		error = '';
	}

	async function submit() {
		if (saving) return;
		const value = Number(amount.trim().replace(',', '.'));
		if (!Number.isFinite(value) || value <= 0) {
			error = 'Amount must be greater than 0.';
			return;
		}
		saving = true;
		error = '';
		const r = await onSubmit({ amount: value, unit, note: note.trim() });
		saving = false;
		if (r.ok) onClose();
		else error = r.error ?? 'Could not record the consumption.';
	}
</script>

<div
	class="fixed inset-0 z-50 grid place-items-center overflow-x-hidden bg-stone-900/40 dark:bg-black/60 backdrop-blur-md p-4"
	role="dialog"
	aria-modal="true"
	aria-label="Consume stock"
	tabindex="-1"
	onclick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
	onkeydown={(e) => { if (e.key === 'Escape' && !saving) onClose(); }}
	transition:fade={{ duration: motionMs(BACKDROP_MS) }}
>
	<div
		class="w-full min-w-0 max-w-sm rounded-2xl bg-white dark:bg-stone-900 p-5 shadow-xl"
		transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}
	>
		<div class="flex items-start justify-between gap-2">
			<div class="min-w-0">
				<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">Use {stockDisplayTitle(item)}</h2>
				<p class="mt-0.5 text-[11px] leading-snug text-stone-500 dark:text-stone-400">
					{item.quantity} {item.quantity === 1 ? 'package' : 'packages'} in stock
				</p>
			</div>
			<button
				type="button"
				class="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg leading-none text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300"
				aria-label="Close"
				disabled={saving}
				onclick={onClose}
			>&times;</button>
		</div>

		<form
			class="mt-3"
			onsubmit={(e) => {
				e.preventDefault();
				void submit();
			}}
		>
			<div class="grid grid-cols-2 gap-2">
				<div class="min-w-0">
					<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="consume-amount">Amount used</label>
					<input
						id="consume-amount"
						class="mt-1 {formField}"
						aria-label="Amount used"
						type="number"
						min="0"
						step="0.01"
						inputmode="decimal"
						placeholder={nativeUnit}
						value={amount}
						oninput={(e) => (amount = e.currentTarget.value)}
					/>
				</div>
				<div class="min-w-0">
					<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="consume-unit">Unit</label>
					<select
						id="consume-unit"
						class="mt-1 {formField}"
						aria-label="Unit"
						value={unit}
						onchange={(e) => (unit = e.currentTarget.value)}
					>
						{#each unitOptions as u (u)}
							<option value={u}>{u}</option>
						{/each}
					</select>
				</div>
			</div>

			<div class="mt-2 flex gap-2">
				<button
					type="button"
					class="rounded-full border border-stone-200 px-3 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
					disabled={saving || item.package_size <= 0}
					onclick={() => fill(item.package_size, nativeUnit)}
				>1 package ({fmtQty(item.package_size, nativeUnit)})</button>
				<button
					type="button"
					class="rounded-full border border-stone-200 px-3 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
					disabled={saving || item.package_size <= 0}
					onclick={() => fill(item.package_size / 2, nativeUnit)}
				>½ package</button>
			</div>

			<div class="mt-3 min-w-0">
				<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="consume-note">Note (optional)</label>
				<input
					id="consume-note"
					class="mt-1 {formField}"
					aria-label="Note"
					type="text"
					placeholder="Used for dinner"
					maxlength="200"
					value={note}
					oninput={(e) => (note = e.currentTarget.value)}
				/>
			</div>

			{#if error}
				<p class="mt-2 text-xs text-rose-600 dark:text-rose-400" role="alert">{error}</p>
			{/if}

			<div class="mt-3 flex justify-end gap-2">
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
				>{saving ? 'Saving…' : 'Use it'}</button>
			</div>
		</form>
	</div>
</div>
