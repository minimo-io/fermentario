<script module lang="ts">
	export type StockDraft = {
		name: string;
		brand: string;
		category: string;
		note: string;
		quantity: string;
		size: string;
		sizeUnit: string;
		bought: string;
		expires: string;
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
		size: '',
		sizeUnit: 'g',
		bought: '',
		expires: '',
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
	import { stockPhotoUrl } from '$lib/stock';
	import { uniqueKey } from '$lib/unique';
	import type { StockItem, StockItemPhoto } from '$lib/types';

	// Add/edit form for one stock item. The kind is fixed by the active tab:
	// consumables track packages × package size against the category goal,
	// durables track purchase, price and end date. Photos: up to eight,
	// downscaled on the client.
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
			size: kind === 'consumable' && item.package_size > 0 ? String(item.package_size) : '',
			sizeUnit: item.package_unit || 'g',
			bought: kind === 'durable' && item.bought_at ? dateLocalValue(item.bought_at) : '',
			expires: kind === 'consumable' && item.expires_at ? dateLocalValue(item.expires_at) : '',
			price: item.price !== null ? String(item.price) : '',
			currency: item.currency || 'BRL',
			where: kind === 'durable' ? item.bought_where : '',
			ended: kind === 'durable' && item.ended_at ? dateLocalValue(item.ended_at) : ''
		};
	}

	// svelte-ignore state_referenced_locally
	let draft = $state<StockDraft>(initial ? draftFrom(initial) : blankStockDraft(kind));
	// svelte-ignore state_referenced_locally
	let existingPhotos = $state<StockItemPhoto[]>(initial?.photos ?? []);
	let removedPhotos = $state<string[]>([]);
	let newPhotos = $state<{ key: string; url: string }[]>([]);
	const keptPhotos = $derived(existingPhotos.filter((p) => !removedPhotos.includes(p.id)));
	let photoErr = $state('');
	let saving = $state(false);
	let error = $state('');
	let full = $state(false);
	let firstField = $state<HTMLElement | null>(null);
	let help = $state<'packages' | 'size' | 'brand' | 'category' | null>(null);
	let brands = $state<string[]>([]);
	let categories = $state<string[]>([]);

	const formField =
		'min-w-0 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2 text-base text-stone-800 dark:text-stone-200 outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-stone-400 dark:focus:border-stone-600';

	const helpBody: Record<string, { title: string; body: string[] }> = {
		packages: {
			title: 'Packages in stock',
			body: [
				'How many unopened packages or units you have right now.',
				'The card shows the total amount: packages × package size. Two toothpaste tubes of 180 g each show 360 g.'
			]
		},
		size: {
			title: 'Package size',
			body: [
				'How much one package contains, for example 500 g of rice or 1 L of milk.',
				'Required: the category goal adds packages × size. An item without a size adds nothing.'
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

	async function onFiles(e: Event) {
		photoErr = '';
		const input = e.currentTarget as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		input.value = '';
		if (files.length === 0) return;
		if (keptPhotos.length + newPhotos.length + files.length > 8) {
			photoErr = 'Up to 8 photos per item.';
			return;
		}
		for (const file of files) {
			if (!file.type.startsWith('image/')) {
				photoErr = 'One of those files is not an image.';
				continue;
			}
			if (file.size > 12 * 1024 * 1024) {
				photoErr = 'One image is larger than 12 MB.';
				continue;
			}
			try {
				const url = await fileToPhotoUrl(file);
				newPhotos = [...newPhotos, { key: uniqueKey(), url }];
			} catch {
				photoErr = 'Could not read one image.';
			}
		}
	}

	function parse(): Record<string, unknown> | null {
		const name = draft.name.trim();
		if (kind === 'durable' && !name) return null;
		const note = draft.note.trim();
		const brand = draft.brand.trim();
		const category = draft.category.trim();
		const expires_at = kind === 'consumable' && draft.expires.trim() ? (dateLocalTimestamp(draft.expires.trim()) ?? NaN) : null;
		if (expires_at !== null && !Number.isFinite(expires_at)) return null;
		if (kind === 'consumable' && !name && !brand && !category) return null;
		const priceRaw = draft.price.trim().replace(',', '.');
		const price = priceRaw === '' ? null : Number(priceRaw);
		if (price !== null && (!Number.isFinite(price) || price < 0)) return null;
		const currency = (draft.currency.trim().toUpperCase() || 'BRL').slice(0, 3);
		if (!/^[A-Z]{3}$/.test(currency)) return null;
		if (kind === 'consumable') {
			const quantity = Number(String(draft.quantity).replace(',', '.'));
			const sizeRaw = draft.size.trim().replace(',', '.');
			const size = sizeRaw === '' ? NaN : Number(sizeRaw);
			if (!Number.isFinite(quantity) || quantity < 0) return null;
			if (!Number.isFinite(size) || size <= 0) return null;
			const sizeUnit = ['g', 'kg', 'ml', 'l'].includes(draft.sizeUnit) ? draft.sizeUnit : 'g';
			return {
				name,
				brand,
				category,
				note,
				quantity,
				package_size: size,
				package_unit: sizeUnit,
				expires_at
			};
		}
		const bought_at = draft.bought.trim() ? (dateLocalTimestamp(draft.bought.trim()) ?? NaN) : null;
		if (bought_at !== null && !Number.isFinite(bought_at)) return null;
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
						? 'Give the item a name, brand or category, plus packages (≥ 0) and a package size (> 0).'
						: 'Name is required; price must be a number ≥ 0 with a 3-letter currency.';
			}
			return;
		}
		if (newPhotos.length > 0) body.photos = newPhotos.map((p) => p.url);
		if (removedPhotos.length > 0) body.removePhotos = [...removedPhotos];
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
				<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="stock-name">Name{kind === 'consumable' ? ' (optional)' : ''}</label>
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
						label="Brand (optional)"
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
					<div class="mt-3">
					<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="stock-expires">Expires (optional)</label>
					<input
						id="stock-expires"
						type="date"
						class="mt-1 {formField}"
						aria-label="Expiration date"
						value={draft.expires}
						oninput={(e) => (draft = { ...draft, expires: e.currentTarget.value })}
					/>
				</div>
				<div class="mt-3">
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
					<div class="mt-3 grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-2">
						<div>
							<div class="flex items-center gap-1.5">
								<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="stock-size">Package size</label>
								<button type="button" class="grid h-4 w-4 place-items-center rounded-full text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300" aria-label="How package size works" title="How package size works" onclick={() => (help = 'size')}><Info class="h-3.5 w-3.5" /></button>
							</div>
							<input
								id="stock-size"
								class="mt-1 {formField}"
								aria-label="Size of one package"
								value={draft.size}
								oninput={(e) => (draft = { ...draft, size: e.currentTarget.value })}
								placeholder="180"
								inputmode="decimal"
							/>
						</div>
						<div>
							<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="stock-size-unit">Unit</label>
							<select
								id="stock-size-unit"
								class="mt-1 {formField}"
								aria-label="Package size unit"
								value={draft.sizeUnit}
								onchange={(e) => (draft = { ...draft, sizeUnit: e.currentTarget.value })}
							>
								<option value="g">g</option>
								<option value="kg">kg</option>
								<option value="ml">ml</option>
								<option value="l">L</option>
							</select>
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
					<span class="block text-xs font-medium text-stone-500 dark:text-stone-400">Photos (optional)</span>
					<div class="mt-1 flex flex-wrap gap-2">
						{#each keptPhotos as p (p.id)}
							<div class="relative">
								<img src={stockPhotoUrl(p)} alt="" class="h-16 w-16 rounded-xl object-cover" />
								<button
									type="button"
									class="absolute -top-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-stone-900 text-xs leading-none text-white hover:bg-rose-600"
									aria-label="Remove photo"
									title="Remove photo"
									onclick={() => (removedPhotos = [...removedPhotos, p.id])}
								>×</button>
							</div>
						{/each}
						{#each newPhotos as p (p.key)}
							<div class="relative">
								<img src={p.url} alt="" class="h-16 w-16 rounded-xl object-cover" />
								<button
									type="button"
									class="absolute -top-1 -right-1 grid h-5 w-5 place-items-center rounded-full bg-stone-900 text-xs leading-none text-white hover:bg-rose-600"
									aria-label="Remove photo"
									title="Remove photo"
									onclick={() => (newPhotos = newPhotos.filter((x) => x.key !== p.key))}
								>×</button>
							</div>
						{/each}
						{#if keptPhotos.length + newPhotos.length < 8}
							<label class="grid h-16 w-16 cursor-pointer place-items-center rounded-xl border border-dashed border-stone-300 dark:border-stone-700 text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800" title="Add photos">
								<ImagePlus class="h-5 w-5" />
								<input type="file" accept="image/*" multiple class="hidden" onchange={onFiles} />
							</label>
						{/if}
					</div>
					{#if photoErr}
						<p class="mt-1 text-xs text-rose-500 dark:text-rose-400">{photoErr}</p>
					{/if}
				</div>
				{#if error}
					<p class="mt-2 text-xs text-rose-500 dark:text-rose-400">{error}</p>
				{/if}
				<div class="sticky bottom-0 -mx-5 mt-4 flex justify-end gap-2 border-t border-stone-200 dark:border-stone-800 bg-white px-5 py-3 dark:bg-stone-900">
					<button
						type="button"
						class="rounded-full border border-stone-200 dark:border-stone-800 px-4 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-50"
						disabled={saving}
						onclick={onClose}
					>Cancel</button>
					<button
						type="submit"
						class="rounded-full bg-stone-900 dark:bg-stone-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-stone-800 dark:hover:bg-stone-600 disabled:opacity-50"
						disabled={saving}
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
