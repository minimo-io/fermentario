<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import Maximize2 from '@lucide/svelte/icons/maximize-2';
	import Minimize2 from '@lucide/svelte/icons/minimize-2';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import { fmtCurrency } from '$lib/currency';
	import ValueChart from '$lib/components/ValueChart.svelte';
	import type { Holding, HoldingAction, HoldingValuePoint } from '$lib/types';

	// Buy/sell ledger for one holding. The form stays at the top; past
	// actions scroll below it. Buys are green, sells are red, and the
	// opening row keeps the quantity the holding started with.
	type Props = {
		holding: Holding;
		onLoad: (id: string) => Promise<HoldingAction[] | null>;
		onRecord: (
			id: string,
			kind: 'buy' | 'sell',
			amount: number,
			price: number | null
		) => Promise<{ ok: boolean; error?: string; actions?: HoldingAction[] }>;
		onClose: () => void;
	};
	let { holding, onLoad, onRecord, onClose }: Props = $props();

	// svelte-ignore state_referenced_locally
	let current = $state<Holding>(holding);
	let actions = $state<HoldingAction[] | null>(null);
	let history = $state<HoldingValuePoint[] | null>(null);
	let kind = $state<'buy' | 'sell'>('buy');
	let amount = $state('');
	// svelte-ignore state_referenced_locally
	let price = $state(holding.price !== null ? String(holding.price) : '');
	let saving = $state(false);
	let error = $state('');
	let loadFailed = $state(false);
	let full = $state(false);

	const formField =
		'w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2 text-base text-stone-800 dark:text-stone-200 outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-stone-400 dark:focus:border-stone-600';

	const cash = $derived(current.category === 'cash');
	const noun = $derived(current.category === 'btc' ? 'BTC' : cash ? 'cash' : 'shares');

	onMount(() => {
		void loadHistory();
		void (async () => {
			const list = await onLoad(current.id);
			if (list) actions = list;
			else loadFailed = true;
		})();
	});

	async function loadHistory() {
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

	async function submit() {
		if (saving) return;
		const qty = Number(amount.replace(',', '.'));
		if (!Number.isFinite(qty) || qty <= 0) {
			error = `Enter an amount greater than 0.`;
			return;
		}
		if (kind === 'sell' && qty > current.amount + 1e-9) {
			error = `You hold ${fmtAmount(current.amount)} ${noun}. You cannot sell more than that.`;
			return;
		}
		const priceRaw = price.trim().replace(',', '.');
		const tradePrice = cash ? 1 : priceRaw === '' ? current.price : Number(priceRaw);
		if (!cash && (tradePrice === null || !Number.isFinite(tradePrice) || tradePrice < 0)) {
			error = 'Enter a valid price per unit.';
			return;
		}
		saving = true;
		error = '';
		const result = await onRecord(current.id, kind, qty, tradePrice);
		saving = false;
		if (!result.ok) {
			error = result.error ?? 'Could not record the action.';
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
</script>

<div
	class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 dark:bg-black/60 backdrop-blur-md transition-[padding] duration-200 ease-out motion-reduce:transition-none {full ? 'p-0' : 'p-4'}"
	role="dialog"
	aria-modal="true"
	aria-label="Buy or sell {current.ticker}"
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
		class="flex w-full flex-col bg-white dark:bg-stone-900 p-5 shadow-xl transition-[height,max-width,border-radius] duration-200 ease-out motion-reduce:transition-none {full ? 'h-dvh max-w-full rounded-none' : 'max-h-[85dvh] max-w-sm rounded-2xl'}"
		transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}
	>
		<div class="mb-3 flex items-start justify-between gap-2">
			<div class="min-w-0">
				<h2 class="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">
					{cash ? current.bank || current.ticker : current.ticker}
				</h2>
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

		<form
			class="shrink-0"
			onsubmit={(e) => {
				e.preventDefault();
				void submit();
			}}
		>
			<div class="grid grid-cols-2 gap-1 rounded-xl bg-stone-100 p-1 dark:bg-stone-800">
				<button
					type="button"
					class="rounded-lg px-3 py-1.5 text-xs font-medium transition {kind === 'buy' ? 'bg-white text-emerald-600 shadow-sm dark:bg-stone-900 dark:text-emerald-400' : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'}"
					aria-pressed={kind === 'buy'}
					onclick={() => { kind = 'buy'; error = ''; }}
				>{cash ? 'Deposit' : 'Buy'}</button>
				<button
					type="button"
					class="rounded-lg px-3 py-1.5 text-xs font-medium transition {kind === 'sell' ? 'bg-white text-rose-600 shadow-sm dark:bg-stone-900 dark:text-rose-400' : 'text-stone-500 hover:text-stone-700 dark:text-stone-400 dark:hover:text-stone-200'}"
					aria-pressed={kind === 'sell'}
					onclick={() => { kind = 'sell'; error = ''; }}
				>{cash ? 'Withdraw' : 'Sell'}</button>
			</div>
			<div class="mt-2 flex gap-2">
				<input
					class="{formField} flex-1"
					aria-label={kind === 'buy' ? (cash ? 'Deposit amount' : 'Buy amount') : cash ? 'Withdrawal amount' : 'Sell amount'}
					placeholder={current.category === 'btc' ? 'Amount in BTC' : cash ? 'Amount' : 'Shares'}
					value={amount}
					oninput={(e) => (amount = e.currentTarget.value)}
					inputmode="decimal"
					autocomplete="off"
				/>
				<button
					type="submit"
					class="shrink-0 rounded-xl px-4 text-xs font-medium text-white disabled:opacity-50 {kind === 'buy' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-rose-600 hover:bg-rose-700'}"
					disabled={saving}
				>{saving ? 'Saving…' : kind === 'buy' ? (cash ? 'Deposit' : 'Buy') : cash ? 'Withdraw' : 'Sell'}</button>
			</div>
			{#if !cash}
				<div class="mt-2">
					<label class="block text-[11px] font-medium text-stone-500 dark:text-stone-400" for="action-price">
						{kind === 'buy' ? 'Price paid' : 'Price received'} per {current.category === 'btc' ? 'BTC' : 'share'}
					</label>
					<div class="mt-1 flex items-center gap-2">
						<input
							id="action-price"
							class="{formField} flex-1"
							aria-label={kind === 'buy' ? 'Price paid' : 'Price received'}
							placeholder="0.00"
							value={price}
							oninput={(e) => (price = e.currentTarget.value)}
							inputmode="decimal"
							autocomplete="off"
						/>
						{#if current.price !== null}
							<button
								type="button"
								class="shrink-0 rounded-full border border-stone-200 px-3 py-1.5 text-[11px] font-medium text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
								onclick={() => (price = String(current.price))}
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
			{#if error}
				<p class="mt-2 text-xs text-rose-600 dark:text-rose-400" role="alert">{error}</p>
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
	</div>
</div>
