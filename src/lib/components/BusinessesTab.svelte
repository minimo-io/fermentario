<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import { fmtCurrency } from '$lib/currency';
	import { loading } from '$lib/loading.svelte';
	import { timeAgo, type AgeLang } from '$lib/age';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import type { TradingOrg, TradingSummary } from '$lib/types';

	// Businesses: Cubiq shows a Soon placeholder; Trading is the swing-trade
	// admin panel. Orders are raw events, positions and the monthly panel
	// derive from them. Sales always close the full position.
	type Props = { onError: (msg: string) => void; lang?: string; widthClass?: string };
	let { onError, lang = 'en', widthClass = 'max-w-2xl' }: Props = $props();

	const ageLang: AgeLang = $derived(lang === 'es' ? 'es' : lang === 'pt' ? 'pt' : 'en');

	const SUB_KEY = 'fermentario.business';
	let sub = $state<'cubiq' | 'trading'>('trading');
	let orgs = $state<TradingOrg[]>([]);
	let orgId = $state('b3');
	let summary = $state<TradingSummary | null>(null);
	let refreshing = $state(false);
	let settingsOpen = $state(false);
	let orderOpen = $state<'BUY' | 'SELL' | null>(null);
	let confirmingOrder = $state<string | null>(null);
	let targetTicker = $state<string | null>(null);

	// Add-order draft.
	let fTicker = $state('');
	let fQty = $state('');
	let fPrice = $state('');
	let fDate = $state('');
	// Ticker picker: B3 universe from the server, filtered as you type.
	// Free text always saves; the list is a shortcut, not a restriction.
	let allTickers = $state<string[]>([]);
	let tickerFocus = $state(false);
	let tickerActive = $state(0);
	// Org settings draft (percents for the rates).
	let sFee = $state('');
	let sIrrf = $state('');
	let sFixed = $state('');
	let sLimit = $state('');
	// Target draft (percent).
	let tPct = $state('');

	const org = $derived(orgs.find((o) => o.id === orgId) ?? null);
	const latestOrderId = $derived.by(() => {
		const list = summary?.orders ?? [];
		if (list.length === 0) return null;
		let best = list[0]!;
		for (const o of list) if (o.date > best.date || (o.date === best.date && o.created_at > best.created_at)) best = o;
		return best.id;
	});

	try {
		const v = sessionStorage.getItem(SUB_KEY);
		if (v === 'cubiq' || v === 'trading') sub = v;
	} catch {}

	function select(next: 'cubiq' | 'trading') {
		sub = next;
		try {
			sessionStorage.setItem(SUB_KEY, next);
		} catch {}
	}

	function fmtMoney(v: number | null): string {
		return v === null ? '—' : fmtCurrency(v, 'BRL', 2);
	}

	function fmtNum(v: number | null, digits = 2): string {
		if (v === null || !Number.isFinite(v)) return '—';
		return v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
	}

	function fmtDate(at: number): string {
		try {
			return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
		} catch {
			return '';
		}
	}

	function notifyChanged() {
		try {
			window.dispatchEvent(new CustomEvent('trading:changed'));
		} catch {}
	}

	function openQty(ticker: string): number {
		return summary?.positions.find((p) => p.ticker === ticker.toUpperCase().trim())?.qty ?? 0;
	}

	// Ranked suggestions: open positions first when selling, then prefix
	// matches, then substring matches. Capped at 8 rows.
	const tickerSuggestions = $derived.by(() => {
		const q = fTicker.trim().toUpperCase();
		const open = (summary?.positions ?? []).map((p) => p.ticker);
		const out: string[] = [];
		const push = (t: string) => {
			if (!out.includes(t)) out.push(t);
		};
		if (orderOpen === 'SELL') for (const t of open) if (!q || t.includes(q)) push(t);
		for (const t of allTickers) if (!q || t.startsWith(q)) push(t);
		for (const t of allTickers) if (q && !t.startsWith(q) && t.includes(q)) push(t);
		return out.slice(0, 8);
	});

	function pickTicker(t: string) {
		fTicker = t;
		tickerFocus = false;
		if (orderOpen === 'SELL') {
			const q = openQty(t);
			if (q > 0) fQty = String(q);
		}
	}

	async function loadOrgs() {
		try {
			const d = await (await loading.track(fetch('/api/trading/orgs'))).json();
			orgs = Array.isArray(d.orgs) ? d.orgs : [];
			if (!orgs.some((o) => o.id === orgId)) orgId = orgs.find((o) => o.enabled)?.id ?? 'b3';
		} catch {
			onError('Failed to load trading venues.');
		}
	}

	async function loadSummary(refreshQuotes = false) {
		try {
			if (refreshQuotes) refreshing = true;
			const d = await (
				await loading.track(fetch(`/api/trading/summary?org=${encodeURIComponent(orgId)}${refreshQuotes ? '&refresh=1' : ''}`))
			).json();
			if (d.error && !d.summary) throw new Error(d.error);
			summary = d.summary as TradingSummary;
			if (d.error) onError(String(d.error));
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to load the trading panel.');
		} finally {
			refreshing = false;
		}
	}

	async function reload() {
		await loadOrgs();
		try {
			const d = await (await loading.track(fetch('/api/trading/tickers'))).json();
			allTickers = Array.isArray(d.tickers) ? d.tickers : [];
		} catch {
			allTickers = [];
		}
		await loadSummary(false);
	}

	$effect(() => {
		void reload();
	});

	$effect(() => {
		void orgId;
		if (orgs.length > 0) void loadSummary(false);
	});

	function startOrder(side: 'BUY' | 'SELL') {
		orderOpen = side;
		fTicker = '';
		tickerActive = 0;
		tickerFocus = false;
		fQty = side === 'SELL' ? '' : fQty;
		fPrice = '';
		fDate = new Date().toISOString().slice(0, 10);
	}

	async function saveOrder() {
		if (!orderOpen) return;
		const qty = Number(String(fQty).replace(',', '.'));
		const price = Number(String(fPrice).replace(',', '.'));
		const when = fDate ? new Date(`${fDate}T12:00:00`).getTime() : Date.now();
		if (!fTicker.trim() || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) {
			onError('Ticker, quantity and unit price are required.');
			return;
		}
		try {
			const res = await loading.track(
				fetch('/api/trading/orders', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ orgId, ticker: fTicker, side: orderOpen, qty, unitPrice: price, date: when })
				})
			);
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to save the order.');
			orderOpen = null;
			await loadSummary(false);
			notifyChanged();
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to save the order.');
		}
	}

	async function removeOrder(id: string) {
		try {
			const res = await loading.track(fetch(`/api/trading/orders/${id}`, { method: 'DELETE' }));
			const d = await res.json().catch(() => ({}));
			if (!res.ok) throw new Error(d?.error ?? 'Failed to delete the order.');
			confirmingOrder = null;
			await loadSummary(false);
			notifyChanged();
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to delete the order.');
		}
	}

	function startSettings() {
		if (!org) return;
		sFee = String(org.feeRate * 100);
		sIrrf = String(org.irrfRate * 100);
		sFixed = String(org.fixedFee);
		sLimit = String(org.exemptLimit);
		settingsOpen = true;
	}

	async function saveSettings() {
		if (!org) return;
		const toNum = (v: string): number | undefined => {
			if (!v.trim()) return undefined;
			const n = Number(v.replace(',', '.'));
			return Number.isFinite(n) ? n : NaN;
		};
		const fee = toNum(sFee);
		const irrf = toNum(sIrrf);
		const fixed = toNum(sFixed);
		const limit = toNum(sLimit);
		if (fee !== undefined && (!Number.isFinite(fee) || fee < 0)) {
			onError('Fee % is invalid.');
			return;
		}
		try {
			const res = await loading.track(
				fetch(`/api/trading/orgs/${org.id}`, {
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						...(fee === undefined ? {} : { feeRate: fee / 100 }),
						...(irrf === undefined ? {} : { irrfRate: irrf / 100 }),
						...(fixed === undefined ? {} : { fixedFee: fixed }),
						...(limit === undefined ? {} : { exemptLimit: limit })
					})
				})
			);
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to save the venue rules.');
			settingsOpen = false;
			await reload();
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to save the venue rules.');
		}
	}

	function startTarget(ticker: string, current: number) {
		targetTicker = ticker;
		tPct = String(current * 100);
	}

	async function saveTarget() {
		if (!targetTicker) return;
		const pct = Number(String(tPct).replace(',', '.'));
		if (!Number.isFinite(pct) || pct < 0) {
			onError('Target % is invalid.');
			return;
		}
		try {
			const res = await loading.track(
				fetch('/api/trading/targets', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ orgId, ticker: targetTicker, targetPct: pct / 100 })
				})
			);
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to save the target.');
			targetTicker = null;
			await loadSummary(false);
			notifyChanged();
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to save the target.');
		}
	}
</script>

<div>
	<div class="mb-4 flex items-center gap-2">
		<button
			type="button"
			class="rounded-full border px-3 py-1 text-xs font-medium {sub === 'cubiq' ? 'border-stone-900 dark:border-stone-700 bg-stone-900 dark:bg-stone-700 text-white' : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'}"
			onclick={() => select('cubiq')}
		>Cubiq</button>
		<button
			type="button"
			class="rounded-full border px-3 py-1 text-xs font-medium {sub === 'trading' ? 'border-stone-900 dark:border-stone-700 bg-stone-900 dark:bg-stone-700 text-white' : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'}"
			onclick={() => select('trading')}
		>Trading</button>
	</div>

	{#if sub === 'cubiq'}
		<p class="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 px-4 py-10 text-center text-sm text-stone-500 dark:text-stone-400">
			Cubiq accounting and P&amp;L live here soon.
		</p>
	{:else}
		<div class="mb-4 flex flex-wrap items-center gap-2">
			{#each orgs as o (o.id)}
				<button
					type="button"
					disabled={!o.enabled}
					title={!o.enabled ? 'Coming later' : o.name}
					class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium {o.id === orgId && o.enabled ? 'border-stone-900 dark:border-stone-700 bg-stone-900 dark:bg-stone-700 text-white' : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'} disabled:cursor-not-allowed disabled:opacity-50"
					onclick={() => { orgId = o.id; }}
				>{o.name}{#if !o.enabled}<span class="rounded-full bg-stone-200 dark:bg-stone-700 px-1.5 py-px text-[10px]">Soon</span>{/if}</button>
			{/each}
			<span class="ml-auto inline-flex items-center gap-2">
				<button
					type="button"
					class="inline-flex items-center gap-1 rounded-full border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-1 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40"
					disabled={refreshing}
					onclick={() => void loadSummary(true)}
				>{refreshing ? 'Updating…' : 'Refresh quotes'}</button>
				{#if org?.enabled}
					<button
						type="button"
						class="rounded-full border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-1 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
						aria-haspopup="dialog"
						onclick={startSettings}
					>Venue rules</button>
				{/if}
			</span>
		</div>

		{#if org && !org.enabled}
			<p class="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 px-4 py-10 text-center text-sm text-stone-500 dark:text-stone-400">
				{org.name} trading comes later. Its cost rules are not set yet.
			</p>
		{:else if summary}
			{#if summary.positions.length > 0}
				<h2 class="mb-1 text-xs font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500">Open positions</h2>
				<ul class="space-y-2">
					{#each summary.positions as p (p.ticker)}
						<li class="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2.5">
							<div class="flex items-start justify-between gap-2">
								<div class="min-w-0">
									<p class="text-sm font-semibold text-stone-900 dark:text-stone-100">{p.ticker}</p>
									<p class="mt-0.5 text-[11px] tabular-nums text-stone-500 dark:text-stone-400">
										{fmtNum(p.qty, 0)} shares · avg {fmtMoney(p.avgPrice)} · cost {fmtMoney(p.cost)}
									</p>
									<p class="mt-0.5 text-[11px] tabular-nums text-stone-500 dark:text-stone-400">
										open {timeAgo(p.since, ageLang)}
									</p>
									<p class="mt-0.5 text-[11px] tabular-nums text-stone-500 dark:text-stone-400">
										quote {p.quote === null ? '—' : fmtMoney(p.quote)}{#if p.quoteSource} · {p.quoteSource}{/if}
										{#if p.potentialPct !== null}
											<span class={p.potentialPct >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
												{p.potentialPct >= 0 ? '+' : ''}{p.potentialPct.toFixed(2)}%
											</span>
										{/if}
									</p>
								</div>
								<span class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium {p.recommendation === 'sell' ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200' : p.recommendation === 'daytrade' ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300' : p.recommendation === 'hold' ? 'bg-amber-100 dark:bg-amber-900/50 text-amber-800 dark:text-amber-200' : 'bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400'}">
									{p.recommendation === 'sell' ? 'Sell: target hit' : p.recommendation === 'daytrade' ? 'Day trade — wait' : p.recommendation === 'hold' ? 'Hold' : 'No quote'}
								</span>
							</div>
							<div class="mt-1.5 flex items-center gap-2">
								<p class="text-[11px] text-stone-500 dark:text-stone-400">Target {(p.targetPct * 100).toFixed(1)}%</p>
								<button
									type="button"
									class="rounded-full border border-stone-200 dark:border-stone-800 px-2.5 py-0.5 text-[11px] font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
									aria-haspopup="dialog"
									onclick={() => startTarget(p.ticker, p.targetPct)}
								>Edit target</button>
							</div>
						</li>
					{/each}
				</ul>
			{/if}

			{#if summary.months.length > 0}
				<h2 class="mb-1 mt-4 text-xs font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500">Monthly panel</h2>
				<ul class="space-y-2">
					{#each summary.months as m (m.month)}
						<li class="flex items-center justify-between gap-2 rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2.5">
							<div class="min-w-0">
								<p class="text-sm font-semibold tabular-nums text-stone-900 dark:text-stone-100">{m.month}</p>
								<p class="mt-0.5 text-[11px] tabular-nums text-stone-500 dark:text-stone-400">
									sales {fmtMoney(m.sales)} · dedo-duro {fmtMoney(m.irrf)} · profit {m.profit >= 0 ? '+' : ''}{fmtMoney(m.profit)}
								</p>
							</div>
							<span class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium {m.exempt ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200' : 'bg-rose-100 dark:bg-rose-900/50 text-rose-800 dark:text-rose-200'}">
								{m.exempt ? 'Exempt' : 'Over limit'}
							</span>
						</li>
					{/each}
				</ul>
			{/if}

			<div class="mb-1 mt-4 flex items-center justify-between gap-2">
				<h2 class="text-xs font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500">Diary</h2>
				<span class="inline-flex gap-2">
					<button
						type="button"
						class="rounded-full bg-stone-900 dark:bg-stone-700 px-3 py-1 text-xs font-medium text-white hover:bg-stone-800 dark:hover:bg-stone-600"
						onclick={() => startOrder('BUY')}
					>+ Buy</button>
					<button
						type="button"
						class="rounded-full border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-1 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
						onclick={() => startOrder('SELL')}
					>− Sell</button>
				</span>
			</div>
			{#if summary.orders.length === 0}
				<p class="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 px-4 py-8 text-center text-sm text-stone-500 dark:text-stone-400">No orders yet. Add the first buy.</p>
			{:else}
				<ul class="space-y-2">
					{#each [...summary.orders].reverse() as o (o.id)}
						<li class="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2.5">
							<div class="flex items-start justify-between gap-2">
								<div class="min-w-0">
									<p class="text-sm font-semibold text-stone-900 dark:text-stone-100">
										<span class={o.side === 'BUY' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>{o.side}</span>
										{o.ticker}
									</p>
									<p class="mt-0.5 text-[11px] tabular-nums text-stone-500 dark:text-stone-400">
										{fmtDate(o.date)} · {o.side === 'BUY' ? 'bought' : 'sold'} {timeAgo(o.date, ageLang)}
									</p>
									<p class="mt-0.5 text-[11px] tabular-nums text-stone-500 dark:text-stone-400">
										{fmtNum(o.qty, 0)} × {fmtMoney(o.unitPrice)} = {fmtMoney(o.value)}
									</p>
									<p class="mt-0.5 text-[11px] tabular-nums text-stone-500 dark:text-stone-400">
										fees {fmtMoney(o.fees)}{#if o.side === 'SELL'} · dedo-duro {fmtMoney(o.irrf)}{/if} · net {fmtMoney(o.net)}
									</p>
									{#if o.side === 'SELL'}
										<p class="mt-0.5 text-[11px] tabular-nums font-medium {o.profit !== null && o.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
											profit {o.profit === null ? '—' : `${o.profit >= 0 ? '+' : ''}${fmtMoney(o.profit)}`}{#if o.profitPct !== null} ({o.profitPct >= 0 ? '+' : ''}{o.profitPct.toFixed(2)}%){/if}
										</p>
									{/if}
								</div>
								{#if o.id === latestOrderId}
									<button
										type="button"
										aria-label="Delete latest order"
										class="grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg leading-none text-stone-300 dark:text-stone-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-400"
										onclick={() => (confirmingOrder = o.id)}
									>&times;</button>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		{/if}
	{/if}
</div>

{#if confirmingOrder}
	<ConfirmDialog
		title="Delete this order?"
		message="Only the latest order can go. Earlier rows are the cost basis of later sales."
		confirmLabel="Delete order"
		cancelLabel="Cancel"
		confirmTone="danger"
		onConfirm={() => { const id = confirmingOrder; if (id) void removeOrder(id); }}
		onCancel={() => (confirmingOrder = null)}
	/>
{/if}

{#if orderOpen}
	{@const side = orderOpen}
	<div
		class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 dark:bg-black/60 backdrop-blur-md p-4"
		role="dialog"
		aria-modal="true"
		aria-label="New {side === 'BUY' ? 'buy' : 'sale'}"
		tabindex="-1"
		onclick={(e) => { if (e.target === e.currentTarget) orderOpen = null; }}
		onkeydown={(e) => { if (e.key === 'Escape') orderOpen = null; }}
		transition:fade={{ duration: motionMs(BACKDROP_MS) }}
	>
		<div class="w-full max-w-sm rounded-2xl bg-white dark:bg-stone-900 p-5 shadow-xl" transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}>
			<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">New {side === 'BUY' ? 'buy' : 'sale'}</h2>
			{#if side === 'SELL'}
				<p class="mt-1 text-[11px] leading-snug text-stone-400 dark:text-stone-500">A sale always closes the full position. Enter the full open quantity.</p>
			{/if}
			<label class="mt-3 block text-xs font-medium text-stone-500 dark:text-stone-400" for="trade-ticker">Ticker</label>
			<div class="relative">
				<input
					id="trade-ticker"
					class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base uppercase text-stone-800 dark:text-stone-200 outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-stone-400 dark:focus:border-stone-600"
					aria-label="Ticker"
					aria-expanded={tickerFocus && tickerSuggestions.length > 0}
					aria-controls="ticker-listbox"
					aria-activedescendant={tickerFocus && tickerSuggestions[tickerActive] ? `ticker-${tickerSuggestions[tickerActive]}` : undefined}
					role="combobox"
					aria-autocomplete="list"
					autocomplete="off"
					placeholder="PETR4"
					value={fTicker}
					onfocus={() => {
						tickerFocus = true;
						tickerActive = 0;
					}}
					onblur={() => {
						// Let a suggestion tap land before closing.
						setTimeout(() => (tickerFocus = false), 120);
					}}
					oninput={(e) => {
						fTicker = e.currentTarget.value;
						tickerActive = 0;
						tickerFocus = true;
						if (side === 'SELL' && fTicker.trim()) {
							const q = openQty(fTicker);
							if (q > 0) fQty = String(q);
						}
					}}
					onkeydown={(e) => {
						if (e.key === 'ArrowDown' && tickerSuggestions.length > 0) {
							e.preventDefault();
							tickerFocus = true;
							tickerActive = (tickerActive + 1) % tickerSuggestions.length;
						} else if (e.key === 'ArrowUp' && tickerSuggestions.length > 0) {
							e.preventDefault();
							tickerFocus = true;
							tickerActive = (tickerActive - 1 + tickerSuggestions.length) % tickerSuggestions.length;
						} else if (e.key === 'Enter' && tickerFocus && tickerSuggestions[tickerActive]) {
							e.preventDefault();
							pickTicker(tickerSuggestions[tickerActive]!);
						} else if (e.key === 'Escape') {
							tickerFocus = false;
						}
					}}
				/>
				{#if tickerFocus && tickerSuggestions.length > 0}
					<ul
						id="ticker-listbox"
						role="listbox"
						class="absolute inset-x-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 py-1 shadow-xl"
					>
						{#each tickerSuggestions as t, i (t)}
							<li id="ticker-{t}" role="option" aria-selected={i === tickerActive}>
								<button
									type="button"
									class="block w-full px-3 py-2 text-left text-base tabular-nums {i === tickerActive ? 'bg-stone-100 dark:bg-stone-800 text-stone-900 dark:text-stone-100' : 'text-stone-700 dark:text-stone-300'}"
									onmousedown={(e) => e.preventDefault()}
									onclick={() => pickTicker(t)}
									onmouseenter={() => (tickerActive = i)}
								>{t}</button>
							</li>
						{/each}
					</ul>
				{/if}
			</div>
			<div class="mt-3 grid grid-cols-2 gap-2">
				<div>
					<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="trade-qty">Quantity</label>
					<input
						id="trade-qty"
						class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base text-stone-800 dark:text-stone-200 outline-none focus:border-stone-400 dark:focus:border-stone-600"
						aria-label="Quantity"
						inputmode="decimal"
						placeholder="2"
						value={fQty}
						oninput={(e) => (fQty = e.currentTarget.value)}
					/>
				</div>
				<div>
					<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="trade-price">Unit price (R$)</label>
					<input
						id="trade-price"
						class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base text-stone-800 dark:text-stone-200 outline-none focus:border-stone-400 dark:focus:border-stone-600"
						aria-label="Unit price"
						inputmode="decimal"
						placeholder="38.50"
						value={fPrice}
						oninput={(e) => (fPrice = e.currentTarget.value)}
					/>
				</div>
			</div>
			<label class="mt-3 block text-xs font-medium text-stone-500 dark:text-stone-400" for="trade-date">Date</label>
			<input
				id="trade-date"
				type="date"
				class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base text-stone-800 dark:text-stone-200 outline-none focus:border-stone-400 dark:focus:border-stone-600"
				value={fDate}
				oninput={(e) => (fDate = e.currentTarget.value)}
			/>
			<div class="mt-4 flex justify-end gap-2">
				<button
					type="button"
					class="rounded-full border border-stone-200 dark:border-stone-800 px-4 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
					onclick={() => (orderOpen = null)}
				>Cancel</button>
				<button
					type="button"
					class="rounded-full bg-stone-900 dark:bg-stone-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-stone-800 dark:hover:bg-stone-600"
					onclick={() => void saveOrder()}
				>Save {side === 'BUY' ? 'buy' : 'sale'}</button>
			</div>
		</div>
	</div>
{/if}

{#if settingsOpen && org}
	<div
		class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 dark:bg-black/60 backdrop-blur-md p-4"
		role="dialog"
		aria-modal="true"
		aria-label="Venue rules"
		tabindex="-1"
		onclick={(e) => { if (e.target === e.currentTarget) settingsOpen = false; }}
		onkeydown={(e) => { if (e.key === 'Escape') settingsOpen = false; }}
		transition:fade={{ duration: motionMs(BACKDROP_MS) }}
	>
		<div class="w-full max-w-sm rounded-2xl bg-white dark:bg-stone-900 p-5 shadow-xl" transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}>
			<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">{org.name} rules</h2>
			<p class="mt-1 text-[11px] leading-snug text-stone-400 dark:text-stone-500">Fees apply to buys and sales. Dedo-duro applies to sales only. New orders use these values; past orders keep theirs.</p>
			<div class="mt-3 grid grid-cols-2 gap-2">
				<div>
					<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="org-fee">Fee %</label>
					<input
						id="org-fee"
						class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base text-stone-800 dark:text-stone-200 outline-none focus:border-stone-400 dark:focus:border-stone-600"
						inputmode="decimal"
						value={sFee}
						oninput={(e) => (sFee = e.currentTarget.value)}
					/>
				</div>
				<div>
					<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="org-irrf">Dedo-duro %</label>
					<input
						id="org-irrf"
						class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base text-stone-800 dark:text-stone-200 outline-none focus:border-stone-400 dark:focus:border-stone-600"
						inputmode="decimal"
						value={sIrrf}
						oninput={(e) => (sIrrf = e.currentTarget.value)}
					/>
				</div>
				<div>
					<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="org-fixed">Fixed fee (R$)</label>
					<input
						id="org-fixed"
						class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base text-stone-800 dark:text-stone-200 outline-none focus:border-stone-400 dark:focus:border-stone-600"
						inputmode="decimal"
						value={sFixed}
						oninput={(e) => (sFixed = e.currentTarget.value)}
					/>
				</div>
				<div>
					<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="org-limit">Monthly limit (R$)</label>
					<input
						id="org-limit"
						class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base text-stone-800 dark:text-stone-200 outline-none focus:border-stone-400 dark:focus:border-stone-600"
						inputmode="decimal"
						value={sLimit}
						oninput={(e) => (sLimit = e.currentTarget.value)}
					/>
				</div>
			</div>
			<div class="mt-4 flex justify-end gap-2">
				<button
					type="button"
					class="rounded-full border border-stone-200 dark:border-stone-800 px-4 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
					onclick={() => (settingsOpen = false)}
				>Cancel</button>
				<button
					type="button"
					class="rounded-full bg-stone-900 dark:bg-stone-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-stone-800 dark:hover:bg-stone-600"
					onclick={() => void saveSettings()}
				>Save</button>
			</div>
		</div>
	</div>
{/if}

{#if targetTicker}
	<div
		class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 dark:bg-black/60 backdrop-blur-md p-4"
		role="dialog"
		aria-modal="true"
		aria-label="Profit target"
		tabindex="-1"
		onclick={(e) => { if (e.target === e.currentTarget) targetTicker = null; }}
		onkeydown={(e) => { if (e.key === 'Escape') targetTicker = null; }}
		transition:fade={{ duration: motionMs(BACKDROP_MS) }}
	>
		<div class="w-full max-w-xs rounded-2xl bg-white dark:bg-stone-900 p-5 shadow-xl" transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}>
			<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">Target for {targetTicker}</h2>
			<label class="mt-3 block text-xs font-medium text-stone-500 dark:text-stone-400" for="target-pct">Target %</label>
			<input
				id="target-pct"
				class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base text-stone-800 dark:text-stone-200 outline-none focus:border-stone-400 dark:focus:border-stone-600"
				inputmode="decimal"
				value={tPct}
				oninput={(e) => (tPct = e.currentTarget.value)}
			/>
			<div class="mt-4 flex justify-end gap-2">
				<button
					type="button"
					class="rounded-full border border-stone-200 dark:border-stone-800 px-4 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
					onclick={() => (targetTicker = null)}
				>Cancel</button>
				<button
					type="button"
					class="rounded-full bg-stone-900 dark:bg-stone-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-stone-800 dark:hover:bg-stone-600"
					onclick={() => void saveTarget()}
				>Save</button>
			</div>
		</div>
	</div>
{/if}
