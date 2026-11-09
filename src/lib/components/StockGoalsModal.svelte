<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import Plus from '@lucide/svelte/icons/plus';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import StockRegistryField from '$lib/components/StockRegistryField.svelte';
	import { stockUnitFamily } from '$lib/stock';
	import { uniqueKey } from '$lib/unique';
	import type { StockCategoryGoal } from '$lib/types';

	// Category amount goals. Each row is an amount per person for one
	// category in grams, kilograms, millilitres or litres; the list shows
	// `people × amount` against the summed packages.
	type Props = {
		goals: StockCategoryGoal[];
		/** When set, the modal edits only this category (read-only field, no add/remove). */
		initialCategory?: string | null;
		/** Display units per category, for the family hint. */
		categoryUnits?: Record<string, string>;
		/** Single family per category; null when mixed or unknown. */
		categoryFamilies?: Record<string, 'mass' | 'volume' | null>;
		/** Parent group per category, when set. */
		categoryGroups?: Record<string, string>;
		onSave: (goals: { category: string; people: number; amount: number; unit: string; note: string }[]) => Promise<{
			ok: boolean;
			error?: string;
		}>;
		onClose: () => void;
	};
	let { goals, initialCategory = null, categoryUnits = {}, categoryFamilies = {}, categoryGroups = {}, onSave, onClose }: Props = $props();

	interface Row {
		key: string;
		category: string;
		people: string;
		amount: string;
		unit: string;
		note: string;
	}

	const NOTE_HINT = 'e.g. Goal represents 1 year of stock';

	// svelte-ignore state_referenced_locally
	let rows = $state<Row[]>(
		(() => {
			if (initialCategory) {
				const g = goals.find((x) => x.category === initialCategory);
				const family = categoryFamilies[initialCategory];
				return [{
					key: uniqueKey(),
					category: initialCategory,
					people: g ? String(g.people) : '1',
					amount: g ? String(g.amount) : '',
					unit: g ? g.unit : family === 'volume' ? 'L' : 'g',
					note: g ? g.note : ''
				}];
			}
			return goals.length > 0
				? goals.map((g) => ({
						key: uniqueKey(),
						category: g.category,
						people: String(g.people),
						amount: String(g.amount),
						unit: g.unit,
						note: g.note
					}))
				: [{ key: uniqueKey(), category: '', people: '1', amount: '', unit: 'g', note: '' }];
		})()
	);
	let categories = $state<string[]>([]);
	let saving = $state(false);
	let error = $state('');
	let goalFilter = $state('');

	const visibleRows = $derived.by(() => {
		if (initialCategory) return rows;
		const q = goalFilter.trim().toLowerCase();
		if (!q) return rows;
		return rows.filter((r) => {
			const category = r.category.toLowerCase();
			const group = (categoryGroups[r.category.trim()] ?? '').toLowerCase();
			return category.includes(q) || group.includes(q);
		});
	});

	const formField =
		'min-w-0 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2 text-base text-stone-800 dark:text-stone-200 outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-stone-400 dark:focus:border-stone-600';

	$effect(() => {
		void (async () => {
			try {
				const d = await (await fetch('/api/stocks/registries')).json();
				categories = Array.isArray(d.categories) ? d.categories : [];
			} catch {
				// The registry is optional; saving a typed name creates it.
			}
		})();
	});

	function num(raw: string): number {
		return Number(raw.trim().replace(',', '.'));
	}

	function addRow() {
		rows = [...rows, { key: uniqueKey(), category: '', people: '1', amount: '', unit: 'g', note: '' }];
	}

	function removeRow(key: string) {
		rows = rows.filter((r) => r.key !== key);
	}

	function onCategory(row: Row, value: string) {
		row.category = value;
		// Picking a category whose items match one family defaults the unit
		// to that family's base unit, so the goal counts them.
		const family = categoryFamilies[value.trim()];
		if (!family || stockUnitFamily(row.unit) === family) return;
		row.unit = family === 'mass' ? 'g' : 'L';
	}

	async function submit() {
		if (saving) return;
		const seen = new Set<string>();
		const out: { category: string; people: number; amount: number; unit: string; note: string }[] = [];
		for (const row of rows) {
			const category = row.category.trim();
			if (!category) {
				error = 'Each goal needs a category.';
				return;
			}
			const key = category.toLowerCase();
			if (seen.has(key)) {
				error = 'One goal per category.';
				return;
			}
			seen.add(key);
			const people = Math.trunc(num(row.people));
			const amount = num(row.amount);
			if (!Number.isFinite(people) || people < 1 || people > 999) {
				error = 'People must be a whole number from 1 to 999.';
				return;
			}
			if (!Number.isFinite(amount) || amount <= 0) {
				error = 'Amount must be greater than 0.';
				return;
			}
			const unit = ['g', 'kg', 'ml', 'L'].includes(row.unit) ? row.unit : null;
			if (!unit) {
				error = 'Unit must be g, kg, ml or L.';
				return;
			}
			out.push({ category, people, amount, unit, note: row.note.trim() });
		}
		saving = true;
		error = '';
		// Scoped mode: merge this one goal into the full set so the other
		// goals survive the endpoint's full-replace contract.
		const payload = initialCategory
			? [...goals.filter((g) => g.category !== initialCategory), ...out]
			: out;
		const r = await onSave(payload);
		saving = false;
		if (r.ok) onClose();
		else error = r.error ?? 'Could not save the goals.';
	}
</script>

<div
	class="fixed inset-0 z-50 grid place-items-center overflow-x-hidden bg-stone-900/40 dark:bg-black/60 backdrop-blur-md p-4"
	role="dialog"
	aria-modal="true"
	aria-label="Category goals"
	tabindex="-1"
	onclick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
	onkeydown={(e) => { if (e.key === 'Escape' && !saving) onClose(); }}
	transition:fade={{ duration: motionMs(BACKDROP_MS) }}
>
	<div
		class="flex max-h-[calc(100dvh-2rem)] w-full min-w-0 max-w-md flex-col rounded-2xl bg-white dark:bg-stone-900 p-5 shadow-xl"
		transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}
	>
		<div class="flex items-start justify-between gap-2">
			<div class="min-w-0">
				<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">{initialCategory ? `Goal · ${initialCategory}` : 'Category goals'}</h2>
				<p class="mt-0.5 text-[11px] leading-snug text-stone-500 dark:text-stone-400">
					How much of each category to keep: grams, kilograms, millilitres or litres per person.
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
			<div class="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
				{#if !initialCategory}
						<div class="min-w-0">
							<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="goals-filter">Filter</label>
							<input
								id="goals-filter"
								class="mt-1 {formField}"
								aria-label="Filter goals"
								type="text"
								placeholder="Category or group"
								value={goalFilter}
								oninput={(e) => (goalFilter = e.currentTarget.value)}
							/>
						</div>
				{/if}
				{#each visibleRows as row, i (row.key)}
					<fieldset class="min-w-0 rounded-xl border border-stone-200 dark:border-stone-800 p-3">
						<legend class="sr-only">Goal {i + 1}</legend>
						{#if initialCategory}
							<div class="mt-1 flex items-center justify-between gap-2">
								<span class="text-xs font-medium text-stone-700 dark:text-stone-300">{row.category}</span>
								<span class="text-[11px] text-stone-400 dark:text-stone-500">Category</span>
							</div>
						{:else}
						<StockRegistryField
							id="goal-category-{row.key}"
							label="Category"
							value={row.category}
							options={categories}
							placeholder="Toothpaste"
							onChange={(v) => onCategory(row, v)}
						/>
						{/if}
						{#if row.category.trim() && categoryUnits[row.category.trim()]}
							{@const fam = categoryFamilies[row.category.trim()]}
							<p class="mt-1 text-[11px] leading-snug {fam && stockUnitFamily(row.unit) !== fam ? 'text-rose-600 dark:text-rose-400' : 'text-stone-500 dark:text-stone-400'}">
								Items here use {categoryUnits[row.category.trim()]}{#if fam && stockUnitFamily(row.unit) !== fam}. This goal is in {row.unit}; change the unit to count them.{/if}
							</p>
						{/if}
						{#if row.category.trim() && categoryGroups[row.category.trim()]}
							<p class="mt-0.5 text-[11px] leading-snug text-stone-500 dark:text-stone-400">Group: {categoryGroups[row.category.trim()]}</p>
						{/if}
						<div class="mt-3 grid grid-cols-3 gap-2">
							<div class="min-w-0">
								<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="goal-people-{row.key}">People</label>
								<input
									id="goal-people-{row.key}"
									class="mt-1 {formField}"
									aria-label="People"
									type="number"
									min="1"
									max="999"
									inputmode="numeric"
									value={row.people}
									oninput={(e) => (row.people = e.currentTarget.value)}
								/>
							</div>
							<div class="min-w-0">
								<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="goal-amount-{row.key}">Amount</label>
								<input
									id="goal-amount-{row.key}"
									class="mt-1 {formField}"
									aria-label="Amount per person"
									type="number"
									min="0"
									step="0.01"
									inputmode="decimal"
									placeholder="200"
									value={row.amount}
									oninput={(e) => (row.amount = e.currentTarget.value)}
								/>
							</div>
							<div class="min-w-0">
								<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="goal-unit-{row.key}">Unit</label>
								<select
									id="goal-unit-{row.key}"
									class="mt-1 {formField}"
									aria-label="Unit"
									value={row.unit}
									onchange={(e) => (row.unit = e.currentTarget.value)}
								>
									<option value="g">g</option>
									<option value="kg">kg</option>
									<option value="ml">ml</option>
									<option value="L">L</option>
								</select>
							</div>
						</div>
						<div class="mt-3 min-w-0">
							<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="goal-note-{row.key}">Note</label>
							<input
								id="goal-note-{row.key}"
								class="mt-1 {formField}"
								aria-label="Note"
								type="text"
								placeholder={NOTE_HINT}
								value={row.note}
								oninput={(e) => (row.note = e.currentTarget.value)}
							/>
						</div>
						{#if !initialCategory}
						<div class="mt-2 flex justify-end">
							<button
								type="button"
								class="text-[11px] font-medium text-stone-400 dark:text-stone-500 hover:text-rose-600 dark:hover:text-rose-400"
								aria-label="Remove goal {i + 1}"
								disabled={saving}
								onclick={() => removeRow(row.key)}
							>Remove</button>
						</div>
						{/if}
					</fieldset>
				{/each}

				{#if !initialCategory}
				<button
					type="button"
					class="inline-flex items-center gap-1.5 rounded-full border border-dashed border-stone-300 px-3 py-1.5 text-xs font-medium text-stone-500 hover:bg-stone-100 disabled:opacity-50 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800"
					disabled={saving}
					onclick={addRow}
				><Plus class="h-3.5 w-3.5" /> Add a goal</button>
				{/if}

				{#if error}
					<p class="text-xs text-rose-600 dark:text-rose-400" role="alert">{error}</p>
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
