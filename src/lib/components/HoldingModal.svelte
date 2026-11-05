<script module lang="ts">
	export type HoldingDraft = {
		ticker: string;
		amount: string;
		avgPrice: string;
		currency: string;
		category: HoldingCategory;
		bank: string;
		country: string;
	};

	export const blankHoldingDraft = (): HoldingDraft => ({
		ticker: '',
		amount: '',
		avgPrice: '',
		currency: 'USD',
		category: 'fii',
		bank: '',
		country: ''
	});

	import type { HoldingCategory } from '$lib/types';
</script>

<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import Maximize2 from '@lucide/svelte/icons/maximize-2';
	import Minimize2 from '@lucide/svelte/icons/minimize-2';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';

	// Add/edit form for one holding, in a global modal so the carousel cards
	// never resize around it. Same overlay standard as CommentModal. All
	// fields use 16px inputs so iOS never auto-zooms on focus.
	// (HoldingDraft lives in the module script above.)
	type Props = {
		title?: string;
		submitLabel?: string;
		initial?: HoldingDraft | null;
		/** Edit hides the amount: quantity changes through buy/sell actions. */
		mode?: 'add' | 'edit';
		/** When the price last came from a refresh or a hand edit. */
		updatedAt?: number | null;
		onSubmit: (h: {
			ticker: string;
			amount: number;
			avgPrice: number | null;
			currency: string;
			category: HoldingCategory;
			bank: string;
			country: string;
		}) => Promise<boolean>;
		onClose: () => void;
	};
	let { title = 'Add holding', submitLabel = 'Add', initial = null, mode = 'add', updatedAt = null, onSubmit, onClose }: Props = $props();

	// svelte-ignore state_referenced_locally
	let draft = $state<HoldingDraft>(initial ? { ...initial } : blankHoldingDraft());
	let saving = $state(false);
	let error = $state('');
	let full = $state(false);
	let firstField = $state<HTMLElement | null>(null);

	const formField =
		'w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2 text-base text-stone-800 dark:text-stone-200 outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-stone-400 dark:focus:border-stone-600';

	$effect(() => {
		if (firstField && firstField instanceof HTMLInputElement) firstField.focus();
	});

	function fmtUpdated(at: number): string {
		return new Date(at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
	}

	function parse(d: HoldingDraft) {
		const category: HoldingCategory = d.category === 'btc' || d.category === 'cash' ? d.category : 'fii';
		const bank = d.bank.trim().slice(0, 40);
		const country = d.country.trim().toUpperCase();
		const ticker = category === 'cash' ? bank.toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9._-]/g, '').slice(0, 12) : d.ticker.trim().toUpperCase();
		// Decimal pads in many locales emit a comma; normalize before parsing.
		const amount = Number(d.amount.replace(',', '.'));
		const currency = d.currency.trim().toUpperCase() || 'USD';
		const avgRaw = d.avgPrice.trim();
		const avgPrice = category === 'cash' || avgRaw === '' ? null : Number(avgRaw.replace(',', '.'));
		if (!/^[A-Z0-9._-]{1,12}$/.test(ticker)) return null;
		if (!Number.isFinite(amount) || amount < 0) return null;
		if (!/^[A-Z]{3}$/.test(currency)) return null;
		if (avgPrice !== null && (!Number.isFinite(avgPrice) || avgPrice < 0)) return null;
		if (category === 'cash') {
			if (!bank) return null;
			if (country !== '' && !/^[A-Z]{2}$/.test(country)) return null;
			return { ticker, amount, avgPrice: null, currency, category, bank, country };
		}
		if (ticker === 'BTC') return { ticker, amount, avgPrice, currency: 'USD', category: 'btc' as const, bank: '', country: '' };
		return { ticker, amount, avgPrice, currency, category, bank: '', country: '' };
	}

	async function submit() {
		const parsed = parse(draft);
		if (!parsed || saving) {
			if (!parsed) error = 'Ticker 1–12 chars, amount and average price numbers ≥ 0, bank required for cash, 3-letter currency, 2-letter country.';
			return;
		}
		saving = true;
		error = '';
		if (await onSubmit(parsed)) {
			onClose();
		} else {
			error = 'Could not save the holding.';
			saving = false;
		}
	}
</script>

<div
	class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 dark:bg-black/60 backdrop-blur-md transition-[padding] duration-200 ease-out motion-reduce:transition-none {full ? 'p-0' : 'p-4'}"
	role="dialog"
	aria-modal="true"
	aria-label={title}
	tabindex="-1"
	onclick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}
	onkeydown={(e) => {
		if (e.key !== 'Escape' || saving) return;
		if (full) full = false;
		else onClose();
	}}
	transition:fade={{ duration: motionMs(BACKDROP_MS) }}
>
	<div
		class="w-full bg-white dark:bg-stone-900 p-5 shadow-xl [interpolate-size:allow-keywords] transition-[height,max-width,border-radius] duration-200 ease-out motion-reduce:transition-none {full ? 'flex h-dvh max-w-full flex-col rounded-none' : 'h-auto max-w-sm rounded-2xl'}"
		transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}
	>
		<div class={full ? 'mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col' : ''}>
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
			{#if updatedAt}
				<p class="-mt-2 mb-3 text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
					Price updated {fmtUpdated(updatedAt)}
				</p>
			{/if}
			<form
				class={full ? 'flex min-h-0 flex-1 flex-col' : ''}
				onsubmit={(e) => { e.preventDefault(); void submit(); }}
			>
				<select
					class={formField}
					aria-label="Category"
					value={draft.category}
					onchange={(e) => {
						const category = (e.currentTarget.value === 'btc' || e.currentTarget.value === 'cash' ? e.currentTarget.value : 'fii') as HoldingCategory;
						draft = { ...draft, category, ticker: category === 'btc' ? 'BTC' : draft.ticker, currency: category === 'btc' ? 'USD' : draft.currency };
					}}
				>
					<option value="fii">FII investments</option>
					<option value="btc">Bitcoin</option>
					<option value="cash">Bank / cash</option>
				</select>
				{#if draft.category === 'cash'}
					<input
						bind:this={firstField}
						class="{formField} mt-3"
						aria-label="Bank"
						placeholder="Bank"
						value={draft.bank}
						oninput={(e) => (draft = { ...draft, bank: e.currentTarget.value.slice(0, 40) })}
						maxlength={40}
						autocapitalize="words"
						autocomplete="off"
					/>
					<div class="mt-3 flex gap-2">
						<input
							class={formField}
							aria-label="Currency"
							placeholder="USD"
							value={draft.currency}
							oninput={(e) => (draft = { ...draft, currency: e.currentTarget.value.toUpperCase().slice(0, 3) })}
							maxlength={3}
							autocapitalize="characters"
							autocomplete="off"
						/>
						<input
							class={formField}
							aria-label="Country"
							placeholder="BR"
							value={draft.country}
							oninput={(e) => (draft = { ...draft, country: e.currentTarget.value.toUpperCase().slice(0, 2) })}
							maxlength={2}
							autocapitalize="characters"
							autocomplete="off"
						/>
					</div>
					<p class="mt-1.5 text-[11px] leading-snug text-stone-500 dark:text-stone-400">Cash counts at face value — no price needed.</p>
				{:else}
					<input
						bind:this={firstField}
						class="{formField} mt-3"
						aria-label="Ticker"
						placeholder="TICKER"
						value={draft.ticker}
						oninput={(e) => (draft = { ...draft, ticker: e.currentTarget.value.toUpperCase().slice(0, 12) })}
						maxlength={12}
						autocapitalize="characters"
						autocomplete="off"
					/>
				{/if}
				{#if mode === 'add'}
					<input
						class="{formField} mt-3"
						aria-label="Amount"
						placeholder="Amount"
						value={draft.amount}
						oninput={(e) => (draft = { ...draft, amount: e.currentTarget.value })}
						inputmode="decimal"
						autocomplete="off"
					/>
				{/if}
				{#if draft.category === 'fii'}
					<input
						class="{formField} mt-3"
						aria-label="Currency"
						placeholder="USD"
						value={draft.currency}
						oninput={(e) => (draft = { ...draft, currency: e.currentTarget.value.toUpperCase().slice(0, 3) })}
						maxlength={3}
						autocapitalize="characters"
						autocomplete="off"
					/>
				{/if}
				{#if draft.category !== 'cash'}
					<input
						class="{formField} mt-3"
						aria-label="Average price"
						placeholder="Average price (cost)"
						value={draft.avgPrice}
						oninput={(e) => (draft = { ...draft, avgPrice: e.currentTarget.value })}
						inputmode="decimal"
						autocomplete="off"
					/>
					<p class="mt-1.5 text-[11px] leading-snug text-stone-500 dark:text-stone-400">
						Average cost for the opening balance. Cards keep using the market quote.
					</p>
				{/if}
				{#if draft.category === 'btc'}
					<p class="mt-1.5 text-[11px] leading-snug text-stone-500 dark:text-stone-400">BTC price loads from the network automatically — no need to type it.</p>
				{/if}
				{#if error}
					<p class="mt-2 text-xs text-rose-600 dark:text-rose-400" role="alert">{error}</p>
				{/if}
				<div class="mt-3 flex justify-end">
					<button
						type="submit"
						class="rounded-full bg-stone-900 dark:bg-stone-700 px-4 py-1.5 text-xs font-medium whitespace-nowrap text-white hover:bg-stone-800 dark:hover:bg-stone-600 disabled:opacity-50"
						disabled={saving}
					>{saving ? 'Saving…' : submitLabel}</button>
				</div>
			</form>
		</div>
	</div>
</div>
