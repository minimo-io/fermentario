<script module lang="ts">
	import type { StockItem } from '$lib/types';

	export type StockDraft = {
		name: string;
		brand: string;
		category: string;
		note: string;
		quantity: string;
		duration: string;
		bought: string;
		price: string;
		currency: string;
		where: string;
		ended: string;
	};

	export const blankStockDraft = (kind: 'consumable' | 'durable'): StockDraft => ({
		name: '',
		brand: '',
		category: '',
		note: '',
		quantity: '',
		duration: '',
		bought: '',
		price: '',
		currency: 'BRL',
		where: '',
		ended: ''
	});
</script>

<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import Maximize2 from '@lucide/svelte/icons/maximize-2';
	import Minimize2 from '@lucide/svelte/icons/minimize-2';
	import ImagePlus from '@lucide/svelte/icons/image-plus';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import { dateLocalValue, dateLocalTimestamp } from '$lib/datetime';
	import { fileToPhotoUrl } from '$lib/stock-photo';
	import Info from '@lucide/svelte/icons/info';
	import FieldHelp from '$lib/components/FieldHelp.svelte';
	import StockRegistryField from '$lib/components/StockRegistryField.svelte';

	// Add/edit form for one stock item. The kind is fixed by the active tab:
	// consumables track packages × days per package, durables track purchase,
	// price and end date. One photo at most, downscaled on the client.
	type Props = {
		kind: 'consumable' | 'durable';
		title?: string;
		submitLabel?: string;
		initial?: StockItem | null;
		onSubmit: (body: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
		onClose: () => void;
	};
	let { kind, title = 'Add item', submitLabel = 'Add', initial = null, onSubmit, onClose }: Props = $props();

	function draftFrom(item: StockItem): StockDraft {
		return {
			name: item.name,
			brand: item.brand,
			category: item.category,
			note: item.note,
			quantity: kind === 'consumable' ? String(item.quantity) : '',
			duration: kind === 'consumable' ? String(item.duration_days) : '',
			bought: kind === 'durable' && item.bought_at ? dateLocalValue(item.bought_at) : '',
			price: kind === 'durable' && item.price !== null ? String(item.price) : '',
			currency: kind === 'durable' ? item.currency || 'BRL' : 'BRL',
			where: kind === 'durable' ? item.bought_where : '',
			ended: kind === 'durable' && item.ended_at ? dateLocalValue(item.ended_at) : ''
		};
	}

	// svelte-ignore state_referenced_locally
	let draft = $state<StockDraft>(initial ? draftFrom(initial) : blankStockDraft(kind));
	// keep: leave the stored photo alone. remove: clear it. data URL: replace it.
	let photoState = $state<{ mode: 'keep' } | { mode: 'remove' } | { mode: 'replace'; url: string }>(
		{ mode: 'keep' }
	);
	let photoErr = $state('');
	let saving = $state(false);
	let error = $state('');
	let full = $state(false);
	let firstField = $state<HTMLElement | null>(null);
	let help = $state<'packages' | 'days' | 'brand' | 'category' | null>(null);
	let brands = $state<string[]>([]);
	let categories = $state<string[]>([]);

	const formField =
		'min-w-0 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2 text-base text-stone-800 dark:text-stone-200 outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-stone-400 dark:focus:border-stone-600';

	const helpBody: Record<string, { title: string; body: string[] }> = {
		packages: {
			title: 'Packages in stock',
			body: [
				'How many unopened packages or units you have right now.',
				'The estimate multiplies this by the days one package lasts for one person. Two toothpaste tubes at 45 days each gives 90 days.'
			]
		},
		days: {
			title: 'Days per package',
			body: [
				'How many days one package lasts for one person.',
				'Example: a toothpaste tube used by one person every day lasts about 45 days. Enter 45. With two tubes, the estimate is 90 days.'
			]
		},
		brand: {
			title: 'Brand',
			body: [
				'The maker, for example Colgate.',
				'Start typing to pick an existing brand, or type a new name. Saving the item adds the name to the registry.'
			]
		},
		category: {
			title: 'Category',
			body: [
				'What the item is, for example Toothpaste, Food or Cleaning.',
				'Pick an existing category or type a new one. Saving the item adds it to the registry.'
			]
		}
	};

	$effect(() => {
		if (firstField && firstField instanceof HTMLInputElement) firstField.focus();
	});

	$effect(() => {
		void (async () => {
			try {
				const d = await (await fetch('/api/stocks/registries')).json();
				brands = Array.isArray(d.brands) ? d.brands : [];
				categories = Array.isArray(d.categories) ? d.categories : [];
			} catch {
				// The registry is optional; the form still creates names on save.
			}
		})();
	});

	function existingPhotoUrl(): string | null {
		if (!initial?.hasPhoto) return null;
		return `/api/stocks/items/${initial.id}/photo?v=${initial.updated_at}`;
	}

	function previewUrl(): string | null {
		if (photoState.mode === 'replace') return photoState.url;
		if (photoState.mode === 'remove') return null;
		return existingPhotoUrl();
	}

	async function onFile(e: Event) {
		photoErr = '';
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		if (!file.type.startsWith('image/')) {
			photoErr = 'That is not an image.';
			return;
		}
		if (file.size > 12 * 1024 * 1024) {
			photoErr = 'That image is larger than 12 MB.';
			return;
		}
		try {
			photoState = { mode: 'replace', url: await fileToPhotoUrl(file) };
		} catch {
			photoErr = 'Could not read that image.';
		}
	}

	function parse(): Record<string, unknown> | null {
		const name = draft.name.trim();
		if (!name) return null;
		const note = draft.note.trim();
		const brand = draft.brand.trim();
		const category = draft.category.trim();
		if (kind === 'consumable') {
			const quantity = Number(String(draft.quantity).replace(',', '.'));
			const duration = Number(String(draft.duration).replace(',', '.'));
			if (!Number.isFinite(quantity) || quantity < 0 || !Number.isFinite(duration) || duration < 0) return null;
			return { name, brand, category, note, quantity, duration_days: duration };
		}
		const bought_at = draft.bought.trim() ? (dateLocalTimestamp(draft.bought.trim()) ?? NaN) : null;
		if (bought_at !== null && !Number.isFinite(bought_at)) return null;
		const priceRaw = draft.price.trim().replace(',', '.');
		const price = priceRaw === '' ? null : Number(priceRaw);
		if (price !== null && (!Number.isFinite(price) || price < 0)) return null;
		const currency = (draft.currency.trim().toUpperCase() || 'BRL').slice(0, 3);
		if (!/^[A-Z]{3}$/.test(currency)) return null;
		const ended_at = draft.ended.trim() ? (dateLocalTimestamp(draft.ended.trim()) ?? NaN) : null;
		if (ended_at !== null && !Number.isFinite(ended_at)) return null;
		return {
			name,
			brand,
			category,
			note,
			bought_at,
			price,
			currency,
			bought_where: draft.where.trim(),
			ended_at
		};
	}

	async function submit() {
		const body = parse();
		if (!body || saving) {
			if (!body) {
				error =
					kind === 'consumable'
						? 'Name, packages and days per package are required (numbers ≥ 0).'
						: 'Name is required; price must be a number ≥ 0 with a 3-letter currency.';
			}
			return;
		}
		if (photoState.mode === 'replace') body.photo = photoState.url;
		else if (photoState.mode === 'remove') body.photo = null;
		saving = true;
		error = '';
		const r = await onSubmit(body);
		if (r.ok) {
			onClose();
		} else {
			error = r.error ?? 'Could not save the item.';
			saving = false;
		}
	}
</script>

<div
	class="fixed inset-0 z-50 grid place-items-center overflow-x-hidden bg-stone-900/40 dark:bg-black/60 backdrop-blur-md transition-[padding] duration-200 ease-out motion-reduce:transition-none {full ? 'p-0' : 'p-4'}"
	role="dialog"
	aria-modal="true"
	aria-label={title}
	tabindex="-1"
	onclick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
	onkeydown={(e) => { if (e.key === 'Escape' && !saving) onClose(); }}
	transition:fade={{ duration: motionMs(BACKDROP_MS) }}
>
	<div
		class="w-full min-w-0 bg-white dark:bg-stone-900 p-5 shadow-xl [interpolate-size:allow-keywords] transition-[height,max-width,border-radius] duration-200 ease-out motion-reduce:transition-none {full ? 'flex h-dvh max-w-full flex-col rounded-none' : 'max-h-[calc(100dvh-2rem)] max-w-sm overflow-y-auto rounded-2xl'}"
		transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}
	>
		<div class={full ? 'mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col' : 'min-w-0'}>
			<div class="mb-4 flex items-start justify-between gap-2">
				<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">{title}</h2>
				<div class="-mr-1 -mt-1 flex shrink-0 items-center gap-0.5">
					<button
						type="button"
						class="grid h-8 w-8 place-items-center rounded-full text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300"
						aria-label={full ? 'Exit full screen' : 'Full screen'}
						aria-pressed={full}
						title={full ? 'Exit full screen' : 'Full screen'}
						onclick={() => (full = !full)}
					>
						{#if full}<Minimize2 class="h-4 w-4" />{:else}<Maximize2 class="h-4 w-4" />{/if}
					</button>
					<button
						type="button"
						class="grid h-8 w-8 place-items-center rounded-full text-lg leading-none text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300"
						aria-label="Close"
						onclick={onClose}
					>&times;</button>
				</div>
			</div>
			<form
				class="min-w-0 {full ? 'flex min-h-0 flex-1 flex-col overflow-y-auto' : ''}"
				onsubmit={(e) => { e.preventDefault(); void submit(); }}
			>
				<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="stock-name">Name</label>
				<input
					id="stock-name"
					bind:this={firstField}
					class="mt-1 {formField}"
					aria-label="Item name"
					value={draft.name}
					oninput={(e) => (draft = { ...draft, name: e.currentTarget.value })}
					placeholder={kind === 'consumable' ? 'Toothpaste' : 'Watch'}
					maxlength="80"
				/>
				<div class="mt-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
					<StockRegistryField
						id="stock-brand"
						label="Brand"
						value={draft.brand}
						options={brands}
						placeholder="Colgate"
						onChange={(v) => (draft = { ...draft, brand: v })}
						onHelp={() => (help = 'brand')}
					/>
					<StockRegistryField
						id="stock-category"
						label="Category"
						value={draft.category}
						options={categories}
						placeholder="Toothpaste"
						onChange={(v) => (draft = { ...draft, category: v })}
						onHelp={() => (help = 'category')}
					/>
				</div>
				{#if kind === 'consumable'}
					<div class="mt-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
						<div>
							<div class="flex items-center gap-1.5">
								<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="stock-qty">Packages</label>
								<button type="button" class="grid h-4 w-4 place-items-center rounded-full text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300" aria-label="How packages work" title="How packages work" onclick={() => (help = 'packages')}><Info class="h-3.5 w-3.5" /></button>
							</div>
							<input
								id="stock-qty"
								class="mt-1 {formField}"
								aria-label="Packages in stock"
								value={draft.quantity}
								oninput={(e) => (draft = { ...draft, quantity: e.currentTarget.value })}
								placeholder="2"
								inputmode="decimal"
							/>
						</div>
						<div>
							<div class="flex items-center gap-1.5">
								<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="stock-duration">Days per package</label>
								<button type="button" class="grid h-4 w-4 place-items-center rounded-full text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300" aria-label="How days per package works" title="How days per package works" onclick={() => (help = 'days')}><Info class="h-3.5 w-3.5" /></button>
							</div>
							<input
								id="stock-duration"
								class="mt-1 {formField}"
								aria-label="Days one package lasts for one person"
								value={draft.duration}
								oninput={(e) => (draft = { ...draft, duration: e.currentTarget.value })}
								placeholder="45"
								inputmode="decimal"
							/>
						</div>
					</div>
				{:else}
					<div class="mt-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
						<div>
							<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="stock-bought">Bought</label>
							<input
								id="stock-bought"
								type="date"
								class="mt-1 {formField}"
								aria-label="Purchase date"
								value={draft.bought}
								oninput={(e) => (draft = { ...draft, bought: e.currentTarget.value })}
							/>
						</div>
						<div>
							<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="stock-ended">Ended (optional)</label>
							<input
								id="stock-ended"
								type="date"
								class="mt-1 {formField}"
								aria-label="End date"
								value={draft.ended}
								oninput={(e) => (draft = { ...draft, ended: e.currentTarget.value })}
							/>
						</div>
					</div>
					<div class="mt-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
						<div>
							<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="stock-price">Price (optional)</label>
							<input
								id="stock-price"
								class="mt-1 {formField}"
								aria-label="Price"
								value={draft.price}
								oninput={(e) => (draft = { ...draft, price: e.currentTarget.value })}
								placeholder="2500"
								inputmode="decimal"
							/>
						</div>
						<div>
							<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="stock-currency">Currency</label>
							<input
								id="stock-currency"
								class="mt-1 uppercase {formField}"
								aria-label="Currency"
								value={draft.currency}
								oninput={(e) => (draft = { ...draft, currency: e.currentTarget.value })}
								placeholder="BRL"
								maxlength="3"
							/>
						</div>
					</div>
					<div class="mt-2 flex gap-2">
						{#each ['BRL', 'USD', 'UYU'] as c (c)}
							<button
								type="button"
								class="rounded-full border px-3 py-1 text-xs font-medium {draft.currency.trim().toUpperCase() === c ? 'border-stone-900 dark:border-stone-700 bg-stone-900 dark:bg-stone-700 text-white' : 'border-stone-200 dark:border-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'}"
								onclick={() => (draft = { ...draft, currency: c })}
							>{c}</button>
						{/each}
					</div>
					<label class="mt-3 block text-xs font-medium text-stone-500 dark:text-stone-400" for="stock-where">Where bought (optional)</label>
					<input
						id="stock-where"
						class="mt-1 {formField}"
						aria-label="Where bought"
						value={draft.where}
						oninput={(e) => (draft = { ...draft, where: e.currentTarget.value })}
						placeholder="Downtown shop"
						maxlength="80"
					/>
				{/if}
				<label class="mt-3 block text-xs font-medium text-stone-500 dark:text-stone-400" for="stock-note">Note (optional)</label>
				<textarea
					id="stock-note"
					rows="2"
					class="mt-1 max-h-[30dvh] w-full resize-y rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base leading-snug text-stone-800 dark:text-stone-200 outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-stone-400 dark:focus:border-stone-600"
					aria-label="Note"
					value={draft.note}
					oninput={(e) => (draft = { ...draft, note: e.currentTarget.value })}
					placeholder={kind === 'consumable' ? 'Sensitive teeth, mint…' : 'Lost it on the trip, scratched case…'}
				></textarea>
				<div class="mt-3">
					<span class="block text-xs font-medium text-stone-500 dark:text-stone-400">Photo (optional)</span>
					{#if previewUrl()}
						<div class="mt-1 flex items-center gap-3">
							<img src={previewUrl()} alt="" class="h-16 w-16 shrink-0 rounded-xl object-cover" />
							<button
								type="button"
								class="text-[11px] font-medium text-stone-400 dark:text-stone-500 hover:text-rose-600 dark:hover:text-rose-400"
								onclick={() => { photoState = { mode: 'remove' }; photoErr = ''; }}
							>Remove photo</button>
						</div>
					{:else}
						<label class="mt-1 inline-flex cursor-pointer items-center gap-2 rounded-full border border-dashed border-stone-300 dark:border-stone-700 px-3 py-1.5 text-xs font-medium text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800">
							<ImagePlus class="h-4 w-4" /> Add a photo
							<input type="file" accept="image/*" class="hidden" onchange={onFile} />
						</label>
					{/if}
					{#if photoErr}
						<p class="mt-1 text-xs text-rose-500 dark:text-rose-400">{photoErr}</p>
					{/if}
				</div>
				{#if error}
					<p class="mt-2 text-xs text-rose-500 dark:text-rose-400">{error}</p>
				{/if}
				<div class="mt-4 flex justify-end gap-2">
					<button
						type="button"
						class="rounded-full border border-stone-200 dark:border-stone-800 px-4 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-50"
						disabled={saving}
						onclick={onClose}
					>Cancel</button>
					<button
						type="submit"
						class="rounded-full bg-stone-900 dark:bg-stone-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-stone-800 dark:hover:bg-stone-600 disabled:opacity-50"
						disabled={saving || !draft.name.trim()}
					>{saving ? 'Saving…' : submitLabel}</button>
				</div>
			</form>
		</div>
	</div>
</div>

{#if help}
	{@const h = helpBody[help]}
	<FieldHelp title={h.title} body={h.body} onClose={() => (help = null)} />
{/if}
