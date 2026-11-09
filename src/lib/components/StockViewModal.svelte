<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import Package from '@lucide/svelte/icons/package';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import { fmtCurrency } from '$lib/currency';
	import {
		fmtQty,
		fmtStockDate,
		stockAgeParts,
		stockDisplayTitle,
		stockExpiry,
		stockExpiryDays,
		stockPhotoUrl,
		stockTotalSize,
		stockUnit
	} from '$lib/stock';
	import type { StockAction, StockCategoryGoal, StockItem } from '$lib/types';

	// Read-only item view. Editing lives behind the text Edit button so the
	// default card gesture opens the photos and data, not a form.
	type Props = {
		item: StockItem;
		categoryGoal: StockCategoryGoal | null;
		categoryStocked: number;
		categoryEstimate: { packages: number; name: string; size: number; unit: string } | null;
		actions: StockAction[];
		lang: string;
		onConsume: () => void;
		onEdit: () => void;
		onDelete: () => void;
		onClose: () => void;
	};
	let { item, categoryGoal, categoryStocked, categoryEstimate, actions, lang, onConsume, onEdit, onDelete, onClose }: Props = $props();

	// svelte-ignore state_referenced_locally
	let selected = $state<string | null>(item.photos[0]?.id ?? null);
	const current = $derived(item.photos.find((p) => p.id === selected) ?? item.photos[0] ?? null);

	const size = $derived(item.package_size);
	const unit = $derived(stockUnit(item));
	const totalSize = $derived(stockTotalSize(item));
	const age = $derived(stockAgeParts(item, lang));
	const goalTarget = $derived(categoryGoal ? categoryGoal.target : 0);
	const goalPct = $derived(categoryGoal && goalTarget > 0 ? Math.min(100, (categoryStocked / goalTarget) * 100) : 0);
	const goalMet = $derived(categoryGoal !== null && categoryStocked >= goalTarget);
	const goalMissing = $derived(Math.max(0, goalTarget - categoryStocked));
</script>

<div
	class="fixed inset-0 z-50 grid place-items-center overflow-x-hidden bg-stone-900/40 dark:bg-black/60 backdrop-blur-md p-4"
	role="dialog"
	aria-modal="true"
	aria-label="{stockDisplayTitle(item)} details"
	tabindex="-1"
	onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
	onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
	transition:fade={{ duration: motionMs(BACKDROP_MS) }}
>
	<div
		class="w-full min-w-0 max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl bg-white dark:bg-stone-900 p-5 shadow-xl"
		transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}
	>
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				<h2 class="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">{stockDisplayTitle(item)}</h2>
				{#if (item.brand && item.brand !== stockDisplayTitle(item)) || item.category}
					<p class="mt-0.5 truncate text-[11px] text-stone-400 dark:text-stone-500">{#if item.brand && item.brand !== stockDisplayTitle(item)}{item.brand}{#if item.category} · {/if}{/if}{item.category}</p>
				{/if}
			</div>
			<div class="flex shrink-0 items-center gap-1.5">
				{#if item.kind === 'consumable'}
					<button
						type="button"
						class="rounded-full bg-stone-900 dark:bg-stone-700 px-3 py-1 text-xs font-medium text-white hover:bg-stone-800 dark:hover:bg-stone-600"
						onclick={onConsume}
					>Consume</button>
				{/if}
				<button
					type="button"
					class="rounded-full border border-stone-300 dark:border-stone-700 px-3 py-1 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
					onclick={onEdit}
				>Edit</button>
				<button
					type="button"
					class="grid h-8 w-8 place-items-center rounded-full text-lg leading-none text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300"
					aria-label="Close"
					onclick={onClose}
				>&times;</button>
			</div>
		</div>

		{#if current}
			<img src={stockPhotoUrl(current)} alt="" class="mt-3 aspect-[4/3] w-full rounded-xl object-cover" />
			{#if item.photos.length > 1}
				<div class="no-scrollbar mt-2 flex gap-2 overflow-x-auto">
					{#each item.photos as photo (photo.id)}
						<button
							type="button"
							class="shrink-0 overflow-hidden rounded-lg {photo.id === current.id ? 'ring-2 ring-stone-900 dark:ring-stone-100' : 'opacity-70 hover:opacity-100'}"
							aria-label="Show photo"
							onclick={() => (selected = photo.id)}
						>
							<img src={stockPhotoUrl(photo)} alt="" loading="lazy" class="h-12 w-12 object-cover" />
						</button>
					{/each}
				</div>
			{/if}
		{:else}
			<div class="mt-3 grid aspect-[4/3] place-items-center rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-300 dark:text-stone-600">
				<Package class="h-8 w-8" aria-hidden="true" />
			</div>
		{/if}

		<div class="mt-3 space-y-1 text-sm">
			{#if item.kind === 'consumable'}
				<div class="flex justify-between gap-3"><span class="text-stone-500 dark:text-stone-400">Packages</span><span class="text-right text-stone-800 dark:text-stone-200">{item.quantity}</span></div>
				<div class="flex justify-between gap-3"><span class="text-stone-500 dark:text-stone-400">Package size</span><span class="text-right text-stone-800 dark:text-stone-200">{size > 0 ? fmtQty(size, unit) : '—'}</span></div>
				<div class="flex justify-between gap-3"><span class="text-stone-500 dark:text-stone-400">Total</span><span class="text-right text-stone-800 dark:text-stone-200">{size > 0 ? fmtQty(totalSize, unit) : '—'}</span></div>
				{#if item.expires_at}
					{@const expiry = stockExpiry(item)}
					{@const days = stockExpiryDays(item)}
					<div class="flex justify-between gap-3">
						<span class="text-stone-500 dark:text-stone-400">Expires</span>
						<span class="text-right {expiry === 'expired' ? 'text-rose-600 dark:text-rose-400 font-medium' : expiry === 'soon' ? 'text-amber-600 dark:text-amber-400 font-medium' : 'text-stone-800 dark:text-stone-200'}">
							{#if expiry === 'expired' && days !== null && days < 0}
								{fmtStockDate(item.expires_at, lang)} ({-days} {-days === 1 ? 'day' : 'days'} ago)
							{:else if expiry === 'soon' && days !== null}
								{fmtStockDate(item.expires_at, lang)} (in {days} {days === 1 ? 'day' : 'days'})
							{:else}
								{fmtStockDate(item.expires_at, lang)}
							{/if}
						</span>
					</div>
				{/if}
				{#if categoryGoal}
				<div class="mt-2 border-t border-stone-200 dark:border-stone-800 pt-2">
					<div class="flex items-center justify-between gap-2 text-[11px] text-stone-500 dark:text-stone-400">
						<span>{categoryGoal.category} goal</span>
						<span>{fmtQty(categoryStocked, categoryGoal.unit)} / {fmtQty(goalTarget, categoryGoal.unit)}</span>
					</div>
					<div class="mt-1 h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800" role="progressbar" aria-label="Category stock versus goal" aria-valuenow={Math.round(goalPct)} aria-valuemin={0} aria-valuemax={100}>
						<div class="h-full rounded-full {goalMet ? 'bg-emerald-500' : 'bg-rose-500'}" style="width: {goalPct}%"></div>
					</div>
					<p class="mt-1 text-[11px] font-medium {goalMet ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
						{#if goalMet}
							Covered
						{:else}
							Need {fmtQty(goalMissing, categoryGoal.unit)} more
						{/if}
					</p>
					{#if categoryEstimate}
						<p class="mt-0.5 text-[11px] leading-snug text-stone-500 dark:text-stone-400">
							≈ {categoryEstimate.packages} × {fmtQty(categoryEstimate.size, categoryEstimate.unit)} of {categoryEstimate.name}
						</p>
					{/if}
					<p class="mt-0.5 text-[11px] leading-snug text-stone-500 dark:text-stone-400">
						{categoryGoal.people} {categoryGoal.people === 1 ? 'person' : 'people'}{#if categoryGoal.note} · {categoryGoal.note}{/if}
					</p>
				</div>
			{/if}
			{:else}
				<div class="flex justify-between gap-3"><span class="text-stone-500 dark:text-stone-400">Bought</span><span class="text-right text-stone-800 dark:text-stone-200">{item.bought_at ? fmtStockDate(item.bought_at, lang) : '—'}</span></div>
				<div class="flex justify-between gap-3"><span class="text-stone-500 dark:text-stone-400">Where</span><span class="text-right text-stone-800 dark:text-stone-200">{item.bought_where || '—'}</span></div>
				<div class="flex justify-between gap-3"><span class="text-stone-500 dark:text-stone-400">Price</span><span class="text-right text-stone-800 dark:text-stone-200">{item.price !== null ? fmtCurrency(item.price, item.currency || 'BRL', 2) : '—'}</span></div>
				<div class="flex justify-between gap-3">
					<span class="text-stone-500 dark:text-stone-400">Age</span>
					<span class="text-right">
						{#if age}
							<span class="text-stone-400 dark:text-stone-500">{age.prefix}</span>{#if age.duration}{' '}<span class="font-medium {item.ended_at === null ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-400 dark:text-stone-500'}">{age.duration}</span>{/if}
						{:else}
							<span class="text-stone-800 dark:text-stone-200">—</span>
						{/if}
					</span>
				</div>
				<div class="flex justify-between gap-3"><span class="text-stone-500 dark:text-stone-400">Status</span><span class="text-right text-stone-800 dark:text-stone-200">{item.ended_at === null ? 'Owned' : `Ended ${fmtStockDate(item.ended_at, lang)}`}</span></div>
			{/if}
		</div>

		{#if item.kind === 'consumable' && actions.length > 0}
			<div class="mt-3 border-t border-stone-200 dark:border-stone-800 pt-3">
				<h3 class="text-[11px] font-medium text-stone-500 dark:text-stone-400">Recent use</h3>
				<ul class="mt-1 space-y-0.5">
					{#each actions.slice(0, 5) as a (a.id)}
						<li class="flex justify-between gap-3 text-xs">
							<span class="min-w-0 truncate text-stone-600 dark:text-stone-300">−{fmtQty(a.amount, a.unit)}{#if a.note} · {a.note}{/if}</span>
							<span class="shrink-0 text-stone-400 dark:text-stone-500">{fmtStockDate(a.created_at, lang)}</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}

		{#if item.note}
			<p class="mt-3 whitespace-pre-wrap border-t border-stone-200 dark:border-stone-800 pt-3 text-sm leading-relaxed text-stone-600 dark:text-stone-300">{item.note}</p>
		{/if}

		<div class="mt-4 flex justify-end">
			<button
				type="button"
				class="text-xs font-medium text-rose-600 dark:text-rose-400 hover:underline"
				onclick={onDelete}
			>Delete</button>
		</div>
	</div>
</div>
