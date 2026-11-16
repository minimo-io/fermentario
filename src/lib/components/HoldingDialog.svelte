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

	export type ParsedHolding = {
		ticker: string;
		amount: number;
		avgPrice: number | null;
		currency: string;
		category: HoldingCategory;
		bank: string;
		country: string;
	};

	import type { HoldingCategory } from '$lib/types';
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import Maximize2 from '@lucide/svelte/icons/maximize-2';
	import Minimize2 from '@lucide/svelte/icons/minimize-2';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import { fmtCurrency } from '$lib/currency';
	import { parseDecimal } from '$lib/numbers';
	import ValueChart from '$lib/components/ValueChart.svelte';
	import type { Holding, HoldingAction, HoldingValuePoint } from '$lib/types';

	// One modal for a holding, with two tabs. Trade holds the buy/sell
	// form, the value graph and the action ledger; Config holds the
	// add/edit form. Card taps open Config, the card + opens Trade, and
	// the add buttons open Config alone — trading needs an existing
	// holding. Same overlay, fullscreen and Escape standard as before.
	type Props = {
		mode: 'add' | 'holding';
		holding?: Holding | null;
		initial?: HoldingDraft | null;
		tab: 'trade' | 'config';
		/** When the price last came from a refresh or a hand edit. */
		updatedAt?: number | null;
		onSaveAdd: (h: ParsedHolding) => Promise<boolean>;
		onSaveEdit: (id: string, h: ParsedHolding) => Promise<boolean>;
		onLoadActions: (id: string) => Promise<HoldingAction[] | null>;
		onRecordAction: (
			id: string,
			kind: 'buy' | 'sell',
			amount: number,
			price: number | null
		) => Promise<{ ok: boolean; error?: string; actions?: HoldingAction[] }>;
		onClose: () => void;
	};
	let {
		mode,
		holding = null,
		initial = null,
		tab,
		updatedAt = null,
		onSaveAdd,
		onSaveEdit,
		onLoadActions,
		onRecordAction,
		onClose
	}: Props = $props();

	// svelte-ignore state_referenced_locally
	let activeTab = $state(mode === 'add' ? 'config' : tab);
	let full = $state(false);

	const formField =
		'w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2 text-base text-stone-800 dark:text-stone-200 outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-stone-400 dark:focus:border-stone-600';

	// --- Config tab: add/edit form --------------------------------------
	// svelte-ignore state_referenced_locally
	let draft = $state<HoldingDraft>(initial ? { ...initial } : blankHoldingDraft());
	let cfgSaving = $state(false);
	let cfgError = $state('');
	let firstField = $state<HTMLElement | null>(null);

	$effect(() => {
		if (activeTab === 'config' && firstField && firstField instanceof HTMLInputElement) firstField.focus();
	});

	function fmtUpdated(at: number): string {
		return new Date(at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
	}

	function parseDraft(d: HoldingDraft): ParsedHolding | null {
		const category: HoldingCategory = d.category === 'btc' || d.category === 'cash' ? d.category : 'fii';
		const bank = d.bank.trim().slice(0, 40);
		const country = d.country.trim().toUpperCase();
		const ticker = category === 'cash' ? bank.toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9._-]/g, '').slice(0, 12) : d.ticker.trim().toUpperCase();
		// Decimal pads in many locales emit a comma; one shared parser
		// accepts a single comma or dot and rejects the rest.
		const amount = parseDecimal(d.amount);
		const currency = d.currency.trim().toUpperCase() || 'USD';
		const avgRaw = d.avgPrice.trim();
		const avgPrice = category === 'cash' || avgRaw === '' ? null : parseDecimal(avgRaw);
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

	async function submitConfig() {
		const parsed = parseDraft(draft);
		if (!parsed || cfgSaving) {
			if (!parsed) cfgError = 'Ticker 1–12 chars, amount and average price numbers ≥ 0, bank required for cash, 3-letter currency, 2-letter country.';
			return;
		}
		cfgSaving = true;
		cfgError = '';
		const ok = mode === 'add' ? await onSaveAdd(parsed) : holding ? await onSaveEdit(holding.id, parsed) : false;
		if (ok) onClose();
		else {
			cfgError = 'Could not save the holding.';
			cfgSaving = false;
		}
	}

	// --- Trade tab: buy/sell ledger --------------------------------------
	// svelte-ignore state_referenced_locally
	let current = $state<Holding | null>(holding);
	let actions = $state<HoldingAction[] | null>(null);
	let history = $state<HoldingValuePoint[] | null>(null);
	let kind = $state<'buy' | 'sell'>('buy');
	let amount = $state('');
	// svelte-ignore state_referenced_locally
	let price = $state(holding?.price !== null && holding?.price !== undefined ? String(holding.price) : '');
	let tradeSaving = $state(false);
	let tradeError = $state('');
	let loadFailed = $state(false);

	const cash = $derived(current?.category === 'cash');
	const noun = $derived(current?.category === 'btc' ? 'BTC' : cash ? 'cash' : 'shares');

	onMount(() => {
		if (!current) return;
		void loadHistory();
		void (async () => {
			const list = await onLoadActions(current.id);
			if (list) actions = list;
			else loadFailed = true;
		})();
	});

	async function loadHistory() {
		if (!current) return;
		try {
			const d = await (await fetch(`/api/holdings/${current.id}/history?days=365`)).json();
			history = Array.isArray(d.points) ? d.points : [];
		} catch {
			history = [];
		}
	}

	function fmtMoney(v: number, ccy: string): string {
		return fmtCurrency(v, ccy, 2);
	}

	function fmtAmount(v: number): string {
		const rounded = Math.round(v * 1e8) / 1e8;
		return new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(rounded);
	}

	function fmtDate(at: number): string {
		return new Date(at).toLocaleString(undefined, {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function label(a: HoldingAction): string {
		if (a.kind === 'opening') return 'Opening balance';
		if (a.kind === 'buy') return cash ? 'Deposit' : 'Buy';
		return cash ? 'Withdrawal' : 'Sell';
	}

	function tone(a: HoldingAction): string {
		if (a.kind === 'buy') return 'text-emerald-600 dark:text-emerald-400';
		if (a.kind === 'sell') return 'text-rose-600 dark:text-rose-400';
		return 'text-stone-500 dark:text-stone-400';
	}

	async function submitTrade() {
		if (tradeSaving || !current) return;
		const qty = parseDecimal(amount);
		if (!Number.isFinite(qty) || qty <= 0) {
			tradeError = `Enter an amount greater than 0.`;
			return;
		}
		if (kind === 'sell' && qty > current.amount + 1e-9) {
			tradeError = `You hold ${fmtAmount(current.amount)} ${noun}. You cannot sell more than that.`;
			return;
		}
		const priceRaw = price.trim();
		const tradePrice = cash ? 1 : priceRaw === '' ? current.price : parseDecimal(priceRaw);
		if (!cash && (tradePrice === null || !Number.isFinite(tradePrice) || tradePrice < 0)) {
			tradeError = 'Enter a valid price per unit.';
			return;
		}
		tradeSaving = true;
		tradeError = '';
		const result = await onRecordAction(current.id, kind, qty, tradePrice);
		tradeSaving = false;
		if (!result.ok) {
			tradeError = result.error ?? 'Could not record the action.';
			return;
		}
		if (result.actions) actions = result.actions;
		void loadHistory();
		current = {
			...current,
			amount:
				kind === 'buy'
					? current.amount + qty
					: current.amount - qty < 1e-9
						? 0
						: current.amount - qty
		};
		amount = '';
	}

	const busy = $derived(cfgSaving || tradeSaving);
	const title = $derived(mode === 'add' ? 'Add holding' : (current ? (cash ? current.bank || current.ticker : current.ticker) : 'Holding'));
</script>

<div
	class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 dark:bg-black/60 backdrop-blur-md transition-[padding] duration-200 ease-out motion-reduce:transition-none {full ? 'p-0' : 'p-4'}"
	role="dialog"
	aria-modal="true"
	aria-label={mode === 'add' ? 'Add holding' : `Holding ${current?.ticker ?? ''}`}
	tabindex="-1"
	onclick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}
	onkeydown={(e) => {
		if (e.key !== 'Escape' || busy) return;
		if (full) full = false;
		else onClose();
	}}
	transition:fade={{ duration: motionMs(BACKDROP_MS) }}
>
	<div
		class="flex w-full flex-col bg-white dark:bg-stone-900 p-5 shadow-xl transition-[height,max-width,border-radius] duration-200 ease-out motion-reduce:transition-none {full ? 'h-dvh max-w-full rounded-none' : 'max-h-[85dvh] max-w-sm rounded-2xl'}"
		transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}
	>
		<div class="mb-3 flex items-start justify-between gap-2">
			<div class="min-w-0">
				<h2 class="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">{title}</h2>
				{#if current && mode === 'holding'}
					<p class="truncate text-[11px] tabular-nums text-stone-500 dark:text-stone-400">
						{#if cash}
							{fmtMoney(current.amount, current.currency)}
						{:else}
							{fmtAmount(current.amount)} {noun}
							{#if current.price !== null}
								· {fmtMoney(current.amount * current.price, current.currency)}
							{/if}
						{/if}
					</p>
				{/if}
			</div>
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

		{#if mode === 'holding'}
			<div class="mb-3 grid shrink-0 grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1 dark:bg-stone-800" role="tablist" aria-label="Holding sections">
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === 'trade'}
					class="rounded-lg px-3 py-1.5 text-xs font-medium transition {activeTab === 'trade' ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-900 dark:text-stone-100' : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'}"
					onclick={() => (activeTab = 'trade')}
				>Trade</button>
				<button
					type="button"
					role="tab"
					aria-selected={activeTab === 'config'}
					class="rounded-lg px-3 py-1.5 text-xs font-medium transition {activeTab === 'config' ? 'bg-white text-stone-900 shadow-sm dark:bg-stone-900 dark:text-stone-100' : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'}"
					onclick={() => (activeTab = 'config')}
				>Config</button>
			</div>
		{/if}

		{#if activeTab === 'trade' && current}
			<form
				class="shrink-0"
				onsubmit={(e) => {
					e.preventDefault();
					void submitTrade();
				}}
			>
				<div class="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1 dark:bg-stone-800">
					<button
						type="button"
						class="rounded-lg px-3 py-1.5 text-xs font-medium transition {kind === 'buy' ? 'bg-white text-emerald-600 shadow-sm dark:bg-stone-900 dark:text-emerald-400' : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'}"
						aria-pressed={kind === 'buy'}
						onclick={() => { kind = 'buy'; tradeError = ''; }}
					>{cash ? 'Deposit' : 'Buy'}</button>
					<button
						type="button"
						class="rounded-lg px-3 py-1.5 text-xs font-medium transition {kind === 'sell' ? 'bg-white text-rose-600 shadow-sm dark:bg-stone-900 dark:text-rose-400' : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'}"
						aria-pressed={kind === 'sell'}
						onclick={() => { kind = 'sell'; tradeError = ''; }}
					>{cash ? 'Withdraw' : 'Sell'}</button>
				</div>
				<div class="mt-2 flex gap-2">
					<input
						class="{formField} flex-1"
						aria-label={kind === 'buy' ? (cash ? 'Deposit amount' : 'Buy amount') : cash ? 'Withdrawal amount' : 'Sell amount'}
						placeholder={current.category === 'btc' ? 'Amount in BTC' : cash ? 'Amount' : 'Shares'}
						value={amount}
						oninput={(e) => (amount = e.currentTarget.value)}
						type="number" step="any"
						autocomplete="off"
					/>
					<button
						type="submit"
						class="shrink-0 rounded-xl px-4 text-xs font-medium text-white disabled:opacity-50 {kind === 'buy' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}"
						disabled={tradeSaving}
					>{tradeSaving ? 'Saving…' : kind === 'buy' ? (cash ? 'Deposit' : 'Buy') : cash ? 'Withdraw' : 'Sell'}</button>
				</div>
				{#if !cash}
					<div class="mt-2">
						<label class="block text-[11px] font-medium text-stone-500 dark:text-stone-400" for="holding-trade-price">
							{kind === 'buy' ? 'Price paid' : 'Price received'} per {current.category === 'btc' ? 'BTC' : 'share'}
						</label>
						<div class="mt-1 flex items-center gap-2">
							<input
								id="holding-trade-price"
								class="{formField} flex-1"
								aria-label={kind === 'buy' ? 'Price paid' : 'Price received'}
								placeholder="0.00"
								value={price}
								oninput={(e) => (price = e.currentTarget.value)}
								type="number" step="any"
								autocomplete="off"
							/>
							{#if current.price !== null}
								<button
									type="button"
									class="shrink-0 rounded-full border border-stone-200 px-3 py-1.5 text-[11px] font-medium text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
									onclick={() => { if (current?.price != null) price = String(current.price); }}
								>Use market</button>
							{/if}
						</div>
						{#if current.price !== null}
							<p class="mt-1 text-[11px] leading-snug text-stone-500 dark:text-stone-400">
								Market: {fmtMoney(current.price, current.currency)} per {current.category === 'btc' ? 'BTC' : 'share'}. Edit the field to record what you actually paid.
							</p>
						{:else}
							<p class="mt-1 text-[11px] leading-snug text-stone-500 dark:text-stone-400">
								No market price cached. Enter the price you {kind === 'buy' ? 'paid' : 'received'}.
							</p>
						{/if}
					</div>
				{:else}
					<p class="mt-1.5 text-[11px] leading-snug text-stone-500 dark:text-stone-400">
						Cash counts at face value.
					</p>
				{/if}
				{#if tradeError}
					<p class="mt-2 text-xs text-rose-600 dark:text-rose-400" role="alert">{tradeError}</p>
				{/if}
			</form>

			<div class="mt-3 min-h-0 flex-1 overflow-y-auto border-t border-stone-200 dark:border-stone-800">
				<div class="py-3">
					<h3 class="mb-1 text-[11px] font-medium text-stone-500 dark:text-stone-400">Value · 1 year</h3>
					{#if history === null}
						<p class="py-4 text-center text-xs text-stone-400 dark:text-stone-500">Loading graph…</p>
					{:else}
						<ValueChart points={history.map((p) => ({ day: p.day, value: p.value }))} currency={current.currency} />
					{/if}
				</div>
				<div class="border-t border-stone-200 dark:border-stone-800">
				{#if actions === null}
					<p class="py-4 text-center text-xs text-stone-400 dark:text-stone-500">Loading…</p>
				{:else if loadFailed}
					<p class="py-4 text-center text-xs text-rose-600 dark:text-rose-400">Could not load the history.</p>
				{:else if actions.length === 0}
					<p class="py-4 text-center text-xs text-stone-400 dark:text-stone-500">No actions yet.</p>
				{:else}
					<ul class="divide-y divide-stone-100 dark:divide-stone-800">
						{#each actions as a (a.id)}
							{#if cash}
								<li class="flex items-start justify-between gap-3 py-2">
									<div class="min-w-0">
										<p class="truncate text-xs font-medium {tone(a)}">{label(a)}</p>
										<p class="truncate text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
											{fmtDate(a.created_at)}
										</p>
									</div>
									<p class="shrink-0 text-right text-xs font-semibold tabular-nums {tone(a)}">
										{a.kind === 'buy' ? '+' : a.kind === 'sell' ? '−' : ''}{fmtMoney(a.amount * (a.price ?? 1), a.currency)}
									</p>
								</li>
							{:else}
								<li class="flex items-start justify-between gap-3 py-2">
									<div class="min-w-0">
										<p class="truncate text-xs font-medium {tone(a)}">{label(a)}</p>
										<p class="truncate text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
											{fmtDate(a.created_at)}
											{#if a.price !== null && a.kind !== 'opening'}
												· {fmtMoney(a.price, a.currency)} / unit
											{:else if a.price !== null}
												· avg {fmtMoney(a.price, a.currency)}
											{/if}
										</p>
									</div>
									<div class="shrink-0 text-right">
										<p class="text-xs font-semibold tabular-nums {tone(a)}">
											{a.kind === 'buy' ? '+' : a.kind === 'sell' ? '−' : ''}{fmtAmount(a.amount)}
										</p>
										{#if a.price !== null && a.kind !== 'opening'}
											<p class="text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
												{fmtMoney(a.amount * a.price, a.currency)}
											</p>
										{/if}
									</div>
								</li>
							{/if}
						{/each}
					</ul>
				{/if}
				</div>
			</div>
		{/if}

		{#if activeTab === 'config'}
			{#if updatedAt && mode === 'holding'}
				<p class="-mt-1 mb-3 text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
					Price updated {fmtUpdated(updatedAt)}
				</p>
			{/if}
			<form
				onsubmit={(e) => { e.preventDefault(); void submitConfig(); }}
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
						type="number" step="any"
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
						type="number" step="any"
						autocomplete="off"
					/>
					<p class="mt-1.5 text-[11px] leading-snug text-stone-500 dark:text-stone-400">
						Average cost for the opening balance. Cards keep using the market quote.
					</p>
				{/if}
				{#if draft.category === 'btc'}
					<p class="mt-1.5 text-[11px] leading-snug text-stone-500 dark:text-stone-400">BTC price loads from the network automatically — no need to type it.</p>
				{/if}
				{#if cfgError}
					<p class="mt-2 text-xs text-rose-600 dark:text-rose-400" role="alert">{cfgError}</p>
				{/if}
				<div class="mt-3 flex justify-end">
					<button
						type="submit"
						class="rounded-full bg-stone-900 dark:bg-stone-700 px-4 py-1.5 text-xs font-medium whitespace-nowrap text-white hover:bg-stone-800 dark:hover:bg-stone-600 disabled:opacity-50"
						disabled={cfgSaving}
					>{cfgSaving ? 'Saving…' : mode === 'add' ? 'Add' : 'Save'}</button>
				</div>
			</form>
		{/if}
	</div>
</div>
