<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import StockRegistryField from '$lib/components/StockRegistryField.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import type { StockCategoryGoal } from '$lib/types';

	// One category editor. Group lives here, not on items. The goal is
	// optional: an empty amount saves the category and group only.
	type Props = {
		category: string;
		group: string;
		goal: StockCategoryGoal | null;
		units: string;
		onSaved: () => void;
		onClose: () => void;
	};
	let { category, group, goal, units, onSaved, onClose }: Props = $props();

	const NOTE_HINT = 'e.g. Goal represents 1 year of stock';
	// svelte-ignore state_referenced_locally
	const inferredUnit = units.includes('ml') || units.includes('L') ? 'L' : 'g';

	// svelte-ignore state_referenced_locally
	let groupDraft = $state(group);
	// svelte-ignore state_referenced_locally
	let people = $state(goal ? String(goal.people) : '1');
	// svelte-ignore state_referenced_locally
	let amount = $state(goal ? String(goal.amount) : '');
	// svelte-ignore state_referenced_locally
	let unit = $state(goal?.unit ?? inferredUnit);
	// svelte-ignore state_referenced_locally
	let note = $state(goal?.note ?? '');
	let groups = $state<string[]>([]);
	let groupToDelete = $state<string | null>(null);
	let saving = $state(false);
	let error = $state('');

	const field =
		'min-w-0 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2 text-base text-stone-800 dark:text-stone-200 outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-stone-400 dark:focus:border-stone-600';

	onMount(() => {
		void (async () => {
			try {
				const d = await (await fetch('/api/stocks/registries')).json();
				groups = Array.isArray(d.groups) ? d.groups : [];
			} catch {
				// Suggestions are optional.
			}
		})();
	});

	async function deleteGroup() {
		const group = groupToDelete;
		if (!group) return;
		try {
			const res = await fetch('/api/stocks/categories', {
				method: 'DELETE',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ group })
			});
			const d = await res.json();
			if (!res.ok) {
				error = d?.error ?? 'Could not delete the group.';
				groupToDelete = null;
				return;
			}
			groups = groups.filter((g) => g !== group);
			if (groupDraft === group) groupDraft = '';
			onSaved();
			groupToDelete = null;
		} catch (e) {
			error = (e as Error)?.message ?? 'Could not delete the group.';
			groupToDelete = null;
		}
	}

	async function submit() {
		if (saving) return;
		const hasGoal = amount.trim() !== '';
		let goalBody: { people: number; amount: number; unit: string; note: string } | null = null;
		if (hasGoal) {
			const p = Math.trunc(Number(people.trim().replace(',', '.')));
			const a = Number(amount.trim().replace(',', '.'));
			if (!Number.isFinite(p) || p < 1 || p > 999) {
				error = 'People must be a whole number from 1 to 999.';
				return;
			}
			if (!Number.isFinite(a) || a <= 0) {
				error = 'Amount must be greater than 0, or empty to save only the group.';
				return;
			}
			const u = ['g', 'kg', 'ml', 'L'].includes(unit) ? unit : null;
			if (!u) {
				error = 'Unit must be g, kg, ml or L.';
				return;
			}
			goalBody = { people: p, amount: a, unit: u, note: note.trim() };
		}
		saving = true;
		error = '';
		try {
			const res = await fetch('/api/stocks/categories', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ category, group: groupDraft.trim(), goal: goalBody })
			});
			const d = await res.json();
			if (!res.ok) {
				error = d?.error ?? 'Could not save the category.';
				saving = false;
				return;
			}
			onSaved();
			onClose();
		} catch (e) {
			error = (e as Error)?.message ?? 'Could not save the category.';
			saving = false;
		}
	}
</script>

<div
	class="fixed inset-0 z-50 grid place-items-center overflow-x-hidden bg-stone-900/40 dark:bg-black/60 backdrop-blur-md p-4"
	role="dialog"
	aria-modal="true"
	aria-label="Category {category}"
	tabindex="-1"
	onclick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
	onkeydown={(e) => { if (e.key === 'Escape' && !saving) onClose(); }}
	transition:fade={{ duration: motionMs(BACKDROP_MS) }}
>
	<div
		class="flex max-h-[calc(100dvh-2rem)] w-full min-w-0 max-w-sm flex-col rounded-2xl bg-white dark:bg-stone-900 p-5 shadow-xl"
		transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}
	>
		<div class="flex items-start justify-between gap-2">
			<div class="min-w-0">
				<h2 class="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">Category · {category}</h2>
				<p class="mt-0.5 text-[11px] leading-snug text-stone-500 dark:text-stone-400">
					The group applies to this category. Items inherit it.
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
			<div class="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
				<div class="rounded-xl border border-stone-200 dark:border-stone-800 p-3">
					<div class="flex items-center justify-between gap-2">
						<span class="text-sm font-medium text-stone-800 dark:text-stone-200">{category}</span>
						<span class="text-[11px] text-stone-400 dark:text-stone-500">Category</span>
					</div>
					<div class="mt-2">
						<StockRegistryField
							id="category-group"
							label="Group (optional)"
							value={groupDraft}
							options={groups}
							placeholder="Beverages"
							onChange={(v) => (groupDraft = v)}
							onDeleteOption={(name) => (groupToDelete = name)}
						/>
					</div>
				</div>

				<div class="rounded-xl border border-stone-200 dark:border-stone-800 p-3">
					<p class="text-xs font-medium text-stone-600 dark:text-stone-300">Goal (optional)</p>
					<div class="mt-2 grid grid-cols-3 gap-2">
						<div class="min-w-0">
							<label class="block text-[11px] font-medium text-stone-500 dark:text-stone-400" for="category-people">People</label>
							<input
								id="category-people"
								class="mt-1 {field}"
								aria-label="People"
								type="number"
								min="1"
								max="999"
								inputmode="numeric"
								value={people}
								oninput={(e) => (people = e.currentTarget.value)}
							/>
						</div>
						<div class="min-w-0">
							<label class="block text-[11px] font-medium text-stone-500 dark:text-stone-400" for="category-amount">Amount</label>
							<input
								id="category-amount"
								class="mt-1 {field}"
								aria-label="Amount per person"
								type="number"
								min="0"
								step="0.01"
								inputmode="decimal"
								placeholder="Empty = no goal"
								value={amount}
								oninput={(e) => (amount = e.currentTarget.value)}
							/>
						</div>
						<div class="min-w-0">
							<label class="block text-[11px] font-medium text-stone-500 dark:text-stone-400" for="category-unit">Unit</label>
							<select
								id="category-unit"
								class="mt-1 {field}"
								aria-label="Unit"
								value={unit}
								onchange={(e) => (unit = e.currentTarget.value)}
							>
								<option value="g">g</option>
								<option value="kg">kg</option>
								<option value="ml">ml</option>
								<option value="L">L</option>
							</select>
						</div>
					</div>
					<div class="mt-2 min-w-0">
						<label class="block text-[11px] font-medium text-stone-500 dark:text-stone-400" for="category-note">Note</label>
						<input
							id="category-note"
							class="mt-1 {field}"
							aria-label="Note"
							type="text"
							placeholder={NOTE_HINT}
							value={note}
							oninput={(e) => (note = e.currentTarget.value)}
						/>
					</div>
					<p class="mt-1 text-[11px] leading-snug text-stone-400 dark:text-stone-500">
						Leave Amount empty to save only the group. Clearing an existing amount removes the goal.
					</p>
				</div>

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

{#if groupToDelete}
	<ConfirmDialog
		title="Delete this group?"
		message="“{groupToDelete}” is cleared from every category that uses it. The categories and items stay."
		confirmLabel="Delete group"
		cancelLabel="Cancel"
		confirmTone="danger"
		onConfirm={() => void deleteGroup()}
		onCancel={() => (groupToDelete = null)}
	/>
{/if}
