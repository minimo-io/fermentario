<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import { fmtCurrency } from '$lib/currency';
	import { parseDecimal } from '$lib/numbers';
	import { loading } from '$lib/loading.svelte';
	import { shortDuration, openAge, type AgeLang } from '$lib/age';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import CollapsibleSection from '$lib/components/CollapsibleSection.svelte';
	import ArrowRightLeft from '@lucide/svelte/icons/arrow-right-left';
	import Pencil from '@lucide/svelte/icons/pencil';
	import TrendingUp from '@lucide/svelte/icons/trending-up';
	import TrendingDown from '@lucide/svelte/icons/trending-down';
	import { coinLabel, venuePair } from '$lib/trading-pairs';
	import TradingPositionCard from '$lib/components/TradingPositionCard.svelte';
	import TradingPositionModal from '$lib/components/TradingPositionModal.svelte';
	import type { TradingOrg, TradingSummary } from '$lib/types';

	// Businesses: Cubiq shows a Soon placeholder; Trading is the swing-trade
	// admin panel. Orders are raw events, positions and the monthly panel
	// derive from them. Sales always close the full position.
	type Props = {
		onError: (msg: string) => void;
		lang?: string;
		widthClass?: string;
		sub: 'cubiq' | 'trading';
		orgId: string;
		/** Per-ticker quote refresh, owned by the admin layout. */
		onRefreshTicker?: (ticker: string) => void;
		refreshingTicker?: string | null;
	};
	let {
		onError,
		lang = 'en',
		widthClass = 'max-w-2xl',
		sub,
		orgId,
		onRefreshTicker,
		refreshingTicker = null
	}: Props = $props();

	const ageLang: AgeLang = $derived(lang === 'es' ? 'es' : lang === 'pt' ? 'pt' : 'en');

	let orgs = $state<TradingOrg[]>([]);
	let summary = $state<TradingSummary | null>(null);
	let settingsOpen = $state(false);
	let orderOpen = $state<'BUY' | 'SELL' | null>(null);
	// The row under correction. Only the latest order can be edited, so the
	// sheet opens prefilled and the ticker stays fixed.
	let editingOrderId = $state<string | null>(null);
	// The cost rules the edited order was recorded with. Read-only here:
	// editing the venue fee must never rewrite an order that already ran.
	let editCosts = $state<null | { feeRatePct: number; spreadRatePct: number; irrfRatePct: number; fixedFee: number }>(null);
	// Sale of one open position: a sale always closes the full quantity, so
	// the sheet asks only for the price the venue offers.
	let sellPos = $state<TradingSummary['positions'][number] | null>(null);
	let sellPrice = $state('');
	let sellDate = $state('');
	let confirmingSale = $state<{ ticker: string; qty: number; price: number; date: number } | null>(null);
	let confirmingOrder = $state<string | null>(null);
	let targetTicker = $state<string | null>(null);
	let detailTicker = $state<string | null>(null);
	let orgLoading = $state(false);
	let ripio = $state<null | {
		pair: string;
		priceUsd: number;
		high24h: number | null;
		low24h: number | null;
		changePct24h: number | null;
		fetchedAt: number;
		cached: boolean;
		live?: boolean;
		authError?: boolean;
		bid: number | null;
		ask: number | null;
	}>(null);
	let ripioLoading = $state(false);
	// Canonical Coinbase BTC-USD beside the Ripio card: same number the
	// holdings price uses, so the two sources can be compared honestly.
	let globalBtc = $state<null | { priceUsd: number; fetchedAt: number; cached: boolean }>(null);

	// Add-order draft.
	let fTicker = $state('');
	let fQty = $state('');
	let fPrice = $state('');
	let fDate = $state('');
	// Goal for the buy being recorded, as a percent. It becomes the
	// position's goal, editable again from the trade detail modal.
	let fGoal = $state('3');
	// Ticker picker: B3 universe from the server, filtered as you type.
	// Free text always saves; the list is a shortcut, not a restriction.
	let allTickers = $state<string[]>([]);
	let tickerFocus = $state(false);
	let tickerActive = $state(0);
	// Org settings draft (percents for the rates).
	let sFee = $state('');
	let sSpread = $state('');
	let sIrrf = $state('');
	let sFixed = $state('');
	let sLimit = $state('');
	let sNote = $state('');
	// Target draft (percent).
	let tPct = $state('');

	const org = $derived(orgs.find((o) => o.id === orgId) ?? null);
	// A venue with a percentage fee takes it on the buy and again on the
	// sell, so the diary states the round-trip total, not one leg.
	const feeBothWays = $derived(org !== null && org.feeRate > 0);
	const roundTripFee = (fee: number): number => (feeBothWays ? fee * 2 : fee);
	// What the venue pays for the whole position at the price typed in the
	// sale sheet: fees, spread and dedo-duro come off the gross, like the
	// projection the cards use.
	// What the edited order pays with its own recorded rules, at the values
	// currently typed in the form.
	const editFeePreview = $derived.by(() => {
		if (!editCosts) return null;
		const qty = parseDecimal(fQty);
		const price = parseDecimal(fPrice);
		if (!Number.isFinite(qty) || !Number.isFinite(price) || qty <= 0 || price <= 0) return null;
		const fee = qty * price * (editCosts.feeRatePct / 100) + editCosts.fixedFee;
		return { fee, both: fee * 2 };
	});
	const sellPreview = $derived.by(() => {
		if (!sellPos || !org) return null;
		const price = parseDecimal(sellPrice);
		if (!Number.isFinite(price) || price <= 0) return null;
		const value = sellPos.qty * price;
		const net = value * (1 - org.feeRate - org.spreadRate - org.irrfRate) - org.fixedFee;
		return Number.isFinite(net) ? { value, net } : null;
	});
	const latestOrderId = $derived.by(() => {
		const list = summary?.orders ?? [];
		if (list.length === 0) return null;
		let best = list[0]!;
		for (const o of list) if (o.date > best.date || (o.date === best.date && o.created_at > best.created_at)) best = o;
		return best.id;
	});

	// Ripio venues quote in USD (BTC_USDC); B3 stays BRL. One switch keeps
// every money label honest.
	function fmtMoney(v: number | null, currency: string = orgId === 'ripio' ? 'USD' : 'BRL', decimals = 2): string {
		if (v === null) return '—';
		return fmtCurrency(v, currency, decimals);
	}

	function fmtNum(v: number | null, digits = 2): string {
		if (v === null || !Number.isFinite(v)) return '—';
		return v.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
	}

	/** Crypto quantities are fractional: show the coins bought, not whole
	 *  units, and keep trailing zeros off. */
	function fmtCoin(v: number): string {
		if (!Number.isFinite(v)) return '—';
		return v.toLocaleString('pt-BR', { maximumFractionDigits: 8 });
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
		return summary?.positions.find((p) => p.ticker === venuePair(ticker, orgId))?.qty ?? 0;
	}

	// Ranked suggestions: open positions first when selling, then prefix
	// matches, then substring matches. Capped at 8 rows.
	const tickerSuggestions = $derived.by(() => {
		const q = fTicker.trim().toUpperCase();
		const open = (summary?.positions ?? []).map((p) => coinLabel(p.ticker, orgId));
		const known = allTickers.map((t) => coinLabel(t, orgId));
		// Ripio names its markets after the coin; its only BTC market is
		// BTC_USDC, which the journal stores under that pair name.
		const coins = orgId === 'ripio' ? ['BTC'] : [];
		const out: string[] = [];
		const push = (t: string) => {
			if (!out.includes(t)) out.push(t);
		};
		if (orderOpen === 'SELL') for (const t of open) if (!q || t.includes(q)) push(t);
		for (const t of coins) if (!q || t.startsWith(q) || t.includes(q)) push(t);
		for (const t of known) if (!q || t.startsWith(q)) push(t);
		for (const t of known) if (q && !t.startsWith(q) && t.includes(q)) push(t);
		return out.slice(0, 8);
	});

	function pickTicker(t: string) {
		fTicker = t;
		tickerFocus = false;
		fGoal = goalFor(t);
		if (orderOpen === 'SELL') {
			const q = openQty(t);
			if (q > 0) fQty = String(q);
		}
	}

	async function loadOrgs() {
		try {
			const d = await (await fetch('/api/trading/orgs')).json();
			orgs = Array.isArray(d.orgs) ? d.orgs : [];
		} catch {
			onError('Failed to load trading venues.');
		}
	}

	async function loadSummary(refresh = false, force = false) {
		try {
			const q = refresh ? `&refresh=1${force ? '&force=1' : ''}` : '';
			const d = await (await fetch(`/api/trading/summary?org=${encodeURIComponent(orgId)}${q}`)).json();
			if (d.error && !d.summary) throw new Error(d.error);
			summary = d.summary as TradingSummary;
			if (d.error) onError(String(d.error));
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to load the trading panel.');
		}
	}

	async function reload() {
		await loadOrgs();
		try {
			const d = await (await fetch('/api/trading/tickers')).json();
			allTickers = Array.isArray(d.tickers) ? d.tickers : [];
		} catch {
			allTickers = [];
		}
		await loadSummary();
	}

	async function setOrgEnabled(id: string, enabled: boolean) {
		orgLoading = true;
		try {
			const res = await loading.track(
				fetch(`/api/trading/orgs/${id}`, {
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ enabled })
				})
			);
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to update the venue.');
			await loadOrgs();
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to update the venue.');
		} finally {
			orgLoading = false;
		}
	}

	async function loadRipio(force = false) {
		ripioLoading = true;
		try {
			// Refresh means re-read upstream now: bypass both the Ripio
			// minute cache and the stored Coinbase rate.
			const f = force ? '&force=1' : '';
			// The global endpoint has no other query, so its force flag needs
			// `?`, not the `&` the pair-scoped Ripio URL uses.
			const g = force ? '?force=1' : '';
			const [r] = await Promise.all([
				fetch(`/api/quotes/ripio?pair=BTC_USDC${f}`).then((res) => res.json()),
				fetch(`/api/quotes/btc-global${g}`)
					.then((res) => res.json())
					// The global card fails soft: the Ripio price still matters
					// without a comparison.
					.then((g) => (globalBtc = g && g.priceUsd ? g : null))
					.catch(() => (globalBtc = null))
			]);
			if (!r || r.error) throw new Error(r?.error ?? 'Ripio quote unavailable.');
			ripio = r;
		} catch (e) {
			onError((e as Error)?.message ?? 'Ripio quote unavailable.');
		} finally {
			ripioLoading = false;
		}
	}

	function ripioSourceLabel(q: NonNullable<typeof ripio>): string {
		if (q.authError) return 'Ripio · public (API key rejected)';
		if (q.live) return 'Ripio · API key (live)';
		return 'Ripio · public';
	}

	function fmtDateTime(at: number): string {
		try {
			return new Date(at).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
		} catch {
			return '';
		}
	}

	$effect(() => {
		const id = orgId;
		void reload();
		// A market refresh (the top card, or one ticker) re-reads both
		// prices on the Ripio page: the venue quote alone would leave the
		// global comparison card on its old number.
		const onChange = () => {
			void loadSummary();
			if (id === 'ripio') void loadRipio();
		};
		window.addEventListener('trading:changed', onChange);
		return () => window.removeEventListener('trading:changed', onChange);
	});

	$effect(() => {
		void orgId;
		if (orgs.length === 0) return;
		if (orgId === 'ripio') void loadRipio();
		void loadSummary();
	});

	function startOrder(side: 'BUY' | 'SELL') {
		editingOrderId = null;
		editCosts = null;
		orderOpen = side;
		fTicker = '';
		tickerActive = 0;
		tickerFocus = false;
		fQty = side === 'SELL' ? '' : fQty;
		fPrice = '';
		fGoal = '3';
		fDate = new Date().toISOString().slice(0, 10);
	}

	/** An open position already has a goal: show it when you sell or rebuy
	 *  that ticker, instead of resetting the form to 3%. */
	function goalFor(ticker: string): string {
		const p = summary?.positions.find((x) => x.ticker === venuePair(ticker, orgId));
		return p ? String(Number((p.targetPct * 100).toFixed(4))) : '3';
	}

	function startEditOrder(o: TradingSummary['orders'][number]) {
		editingOrderId = o.id;
		editCosts = {
			feeRatePct: o.feeRate * 100,
			spreadRatePct: o.spreadRate * 100,
			irrfRatePct: o.irrfRate * 100,
			fixedFee: o.fixedFee
		};
		orderOpen = o.side;
		fTicker = coinLabel(o.ticker, orgId);
		tickerActive = 0;
		tickerFocus = false;
		fQty = String(Number(o.qty.toFixed(8)));
		fPrice = String(o.unitPrice);
		fGoal = String(Number((o.targetPct * 100).toFixed(4)));
		fDate = new Date(o.date).toISOString().slice(0, 10);
	}

	function closeOrder() {
		orderOpen = null;
		editingOrderId = null;
		editCosts = null;
	}

	async function saveOrder() {
		if (!orderOpen) return;
		const editing = editingOrderId;
		const qty = parseDecimal(fQty);
		const price = parseDecimal(fPrice);
		const when = fDate ? new Date(`${fDate}T12:00:00`).getTime() : Date.now();
		const goal = orderOpen === 'BUY' ? parseDecimal(fGoal) : NaN;
		if ((!editing && !fTicker.trim()) || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0) {
			onError(editing ? 'Quantity and unit price are required.' : 'Ticker, quantity and unit price are required.');
			return;
		}
		if (orderOpen === 'BUY' && (!Number.isFinite(goal) || goal < 0)) {
			onError('Goal % is invalid.');
			return;
		}
		try {
			// An edit changes the numbers, never the venue, the side or the
			// ticker: the goal is stored per ticker, and the server recomputes
			// value, fees and net from the rules.
			const res = await loading.track(
				editing
					? fetch(`/api/trading/orders/${editing}`, {
							method: 'PATCH',
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({
								qty,
								unitPrice: price,
								date: when,
								targetPct: orderOpen === 'BUY' ? goal / 100 : undefined
							})
						})
					: fetch('/api/trading/orders', {
							method: 'POST',
							headers: { 'content-type': 'application/json' },
							body: JSON.stringify({
								orgId,
								ticker: venuePair(fTicker, orgId),
								side: orderOpen,
								qty,
								unitPrice: price,
								date: when,
								targetPct: orderOpen === 'BUY' ? goal / 100 : undefined
							})
						})
			);
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to save the order.');
			closeOrder();
			await loadSummary();
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
			await loadSummary();
			notifyChanged();
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to delete the order.');
		}
	}

	function startSell(p: TradingSummary['positions'][number]) {
		sellPos = p;
		sellPrice = p.quote === null ? '' : String(p.quote);
		sellDate = new Date().toISOString().slice(0, 10);
	}

	function closeSell() {
		sellPos = null;
		confirmingSale = null;
	}

	/** The sheet itself is a form; the dialog after it is the confirmation,
	 *  because a sale is not reversible from the diary. */
	function confirmSale() {
		if (!sellPos) return;
		const price = parseDecimal(sellPrice);
		if (!Number.isFinite(price) || price <= 0) {
			onError('Sale price is required.');
			return;
		}
		const when = sellDate ? new Date(`${sellDate}T12:00:00`).getTime() : Date.now();
		confirmingSale = { ticker: sellPos.ticker, qty: sellPos.qty, price, date: when };
	}

	async function saveSale() {
		const sale = confirmingSale;
		if (!sale) return;
		try {
			const res = await loading.track(
				fetch('/api/trading/orders', {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({
						orgId,
						ticker: sale.ticker,
						side: 'SELL',
						qty: sale.qty,
						unitPrice: sale.price,
						date: sale.date
					})
				})
			);
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to save the sale.');
			closeSell();
			await loadSummary();
			notifyChanged();
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to save the sale.');
		}
	}

	function startSettings() {
		if (!org) return;
		sFee = String(org.feeRate * 100);
		sSpread = String(org.spreadRate * 100);
		sIrrf = String(org.irrfRate * 100);
		sFixed = String(org.fixedFee);
		sNote = org.feeNote;
		sLimit = String(org.exemptLimit);
		settingsOpen = true;
	}

	async function saveSettings() {
		if (!org) return;
		const toNum = (v: string): number | undefined => {
			if (!v.trim()) return undefined;
			return parseDecimal(v);
		};
		const fee = toNum(sFee);
		const spread = toNum(sSpread);
		const irrf = toNum(sIrrf);
		const fixed = toNum(sFixed);
		const limit = toNum(sLimit);
		if (fee !== undefined && (!Number.isFinite(fee) || fee < 0)) {
			onError('Fee % is invalid.');
			return;
		}
		if (spread !== undefined && (!Number.isFinite(spread) || spread < 0)) {
			onError('Spread % is invalid.');
			return;
		}
		// Ripio carries one percentage and a note; its spread and fixed fee
		// stay at zero so a single rate explains every operation.
		const body =
			orgId === 'ripio'
				? {
						...(fee === undefined ? {} : { feeRate: fee / 100 }),
						spreadRate: 0,
						fixedFee: 0,
						feeNote: sNote
					}
				: {
						...(fee === undefined ? {} : { feeRate: fee / 100 }),
						...(spread === undefined ? {} : { spreadRate: spread / 100 }),
						...(irrf === undefined ? {} : { irrfRate: irrf / 100 }),
						...(fixed === undefined ? {} : { fixedFee: fixed }),
						...(limit === undefined ? {} : { exemptLimit: limit })
					};
		try {
			const res = await loading.track(
				fetch(`/api/trading/orgs/${org.id}`, {
					method: 'PATCH',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify(body)
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
		const pct = parseDecimal(tPct);
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
			await loadSummary();
			notifyChanged();
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to save the target.');
		}
	}
</script>

<div class="min-w-0 overflow-x-hidden">
	<div class="mb-4 flex items-center gap-2">
		<a
			href="/admin/businesses/cubiq"
			class="rounded-full border px-3 py-1 text-xs font-medium {sub === 'cubiq' ? 'border-stone-900 dark:border-stone-700 bg-stone-900 dark:bg-stone-700 text-white' : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'}"
			aria-current={sub === 'cubiq' ? 'page' : undefined}
		>Cubiq</a>
		<a
			href="/admin/businesses/trading/b3"
			class="rounded-full border px-3 py-1 text-xs font-medium {sub === 'trading' ? 'border-stone-900 dark:border-stone-700 bg-stone-900 dark:bg-stone-700 text-white' : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'}"
			aria-current={sub === 'trading' ? 'page' : undefined}
		>Trading</a>
	</div>

	{#if sub === 'cubiq'}
		<p class="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 px-4 py-10 text-center text-sm text-stone-500 dark:text-stone-400">
			Cubiq accounting and P&amp;L live here soon.
		</p>
	{:else}
		<div class="mb-4 flex flex-wrap items-center gap-2">
			{#each orgs as o (o.id)}
				<a
					href="/admin/businesses/trading/{o.id}"
					title={!o.enabled ? 'Watch only — enable to trade' : o.name}
					aria-current={o.id === orgId ? 'page' : undefined}
					class="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium {o.id === orgId && o.enabled ? 'border-stone-900 dark:border-stone-700 bg-stone-900 dark:bg-stone-700 text-white' : 'border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800'} {o.id === orgId && !o.enabled ? 'ring-1 ring-stone-400 dark:ring-stone-500' : ''} {!o.enabled && o.id !== orgId ? 'opacity-70' : ''}"
				>{o.name}{#if !o.enabled}<span class="rounded-full bg-stone-200 dark:bg-stone-700 px-1.5 py-px text-[10px]">Watch</span>{/if}</a>
			{/each}
			<span class="ml-auto inline-flex flex-wrap items-center justify-end gap-2">
				{#if org?.enabled}
					<button
						type="button"
						class="rounded-full bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
						onclick={() => startOrder('BUY')}
					>+ Buy</button>
				{/if}
				{#if org?.enabled}
					<button
						type="button"
						class="rounded-full border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-1 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
						aria-haspopup="dialog"
						onclick={startSettings}
					>Fees</button>
				{/if}
			</span>
		</div>

		{#if !org}
			<div class="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 px-4 py-10 text-center">
				<p class="text-sm text-stone-500 dark:text-stone-400">Unknown trading venue.</p>
				<a
					href="/admin/businesses/trading/b3"
					class="mt-3 inline-block rounded-full border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-4 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
				>Back to B3</a>
			</div>
		{:else if !org.enabled}
			<div class="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 px-4 py-10 text-center">
				<p class="text-sm text-stone-500 dark:text-stone-400">{org.name} is off. Enable it to watch prices and place orders.</p>
				<button
					type="button"
					class="mt-3 rounded-full border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-4 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
					disabled={orgLoading}
					onclick={() => void setOrgEnabled(org.id, true)}
				>{orgLoading ? 'Enabling…' : 'Enable'}</button>
			</div>
		{/if}

		{#if org && org.enabled && org.id === 'ripio'}
			{@const q = ripio}
			<p class="mb-2 text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
				Fee {(org.feeRate * 100).toFixed(2)}% on every operation{#if org.feeNote} · {org.feeNote}{/if}
			</p>
			<!-- Two sources side by side: Ripio's own ticker and the
				Coinbase canonical rate (the same number Holdings prices BTC
				with), plus the gap between them in value and percent. -->
			<div class="grid gap-3 sm:grid-cols-2">
				<div class="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-4 py-5 text-center">
					<p class="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">BTC · Ripio</p>
					<p class="mt-1 text-2xl font-semibold tabular-nums text-stone-900 dark:text-stone-100">
						{q ? fmtMoney(q.priceUsd, 'USD', 2) : '—'}
					</p>
					{#if q}
						<p class="mt-0.5 text-[11px] tabular-nums {q.changePct24h !== null && q.changePct24h < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}">
							{q.changePct24h === null ? '—' : `${q.changePct24h >= 0 ? '+' : ''}${q.changePct24h.toFixed(2)}% / 24h`}
							{#if q.high24h !== null && q.low24h !== null}
								<span class="text-stone-400 dark:text-stone-500"> · H {fmtMoney(q.high24h, 'USD', 0)} · L {fmtMoney(q.low24h, 'USD', 0)}</span>
							{/if}
						</p>
						<p class="mt-0.5 text-[11px] tabular-nums text-stone-400 dark:text-stone-500">{ripioSourceLabel(q)} · updated {fmtDateTime(q.fetchedAt)}{q.cached ? ' · cached' : ''}</p>
					{:else}
						<p class="mt-1 text-xs text-stone-400 dark:text-stone-500">No quote yet.</p>
					{/if}
				</div>
				<div class="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-4 py-5 text-center">
					<p class="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">BTC · Global</p>
					<p class="mt-1 text-2xl font-semibold tabular-nums text-stone-900 dark:text-stone-100">
						{globalBtc ? fmtMoney(globalBtc.priceUsd, 'USD', 2) : '—'}
					</p>
					{#if globalBtc}
						<p class="mt-0.5 text-[11px] tabular-nums text-stone-400 dark:text-stone-500">Coinbase · updated {fmtDateTime(globalBtc.fetchedAt)}{globalBtc.cached ? ' · cached' : ''}</p>
					{:else}
						<p class="mt-1 text-xs text-stone-400 dark:text-stone-500">No global quote.</p>
					{/if}
				</div>
			</div>

			<div class="mt-3 flex items-center justify-center gap-2">
				<button
					type="button"
					class="inline-flex items-center gap-1 rounded-full border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-1 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40"
					disabled={ripioLoading}
					onclick={() => { void loadRipio(true); void loadSummary(true, true); }}
				>{ripioLoading ? 'Updating…' : 'Refresh'}</button>
			</div>
		{/if}

		{#if org && org.enabled && summary && summary.org.id === orgId}
			{#if summary.positions.length > 0}
				<CollapsibleSection label="Open positions" storageKey="ferm:trading-positions">
					<ul class="flex flex-wrap gap-2">
						{#each summary.positions as p (p.ticker)}
							<li class="w-40 shrink-0">
								<div
									role="button"
									tabindex="0"
									aria-label="Open {coinLabel(p.ticker, orgId)} details"
									aria-haspopup="dialog"
									class="h-full w-full cursor-pointer rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
									onclick={() => (detailTicker = p.ticker)}
									onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); detailTicker = p.ticker; } }}
								>
									<TradingPositionCard
										p={{ ...p, quoteSource: null }}
										compact
										age={openAge(p.since, ageLang)}
										onEditTarget={() => startTarget(p.ticker, p.targetPct)}
										onSell={() => startSell(p)}
										onRefresh={onRefreshTicker ? () => onRefreshTicker(p.ticker) : undefined}
										refreshing={refreshingTicker === p.ticker}
									/>
								</div>
							</li>
						{/each}
					</ul>
				</CollapsibleSection>
			{/if}

			{#if summary.months.length > 0}
				<h2 class="mb-1 mt-4 text-xs font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500">Monthly panel</h2>
				<ul class="space-y-2">
					{#each summary.months as m (m.month)}
						<li class="flex items-center justify-between gap-2 rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2.5">
							<div class="min-w-0">
								<p class="text-sm font-semibold tabular-nums text-stone-900 dark:text-stone-100">{m.month}</p>
								{#if m.sales <= 0}
									<p class="mt-0.5 text-[11px] text-stone-400 dark:text-stone-500">
										No sales yet — buys don't count toward the ceiling.
									</p>
								{:else}
									<p class="mt-0.5 text-[11px] tabular-nums text-stone-500 dark:text-stone-400">
										sales {fmtMoney(m.sales)} · fees {fmtMoney(m.fees)} · dedo-duro {fmtMoney(m.irrf)} · profit {m.profit >= 0 ? '+' : ''}{fmtMoney(m.profit)}
									</p>
								{/if}
							</div>
							<span class="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium {m.exempt ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200' : 'bg-rose-100 dark:bg-rose-900/50 text-rose-800 dark:text-rose-200'}">
								{m.exempt ? 'Exempt' : 'Over limit'}
							</span>
						</li>
					{/each}
				</ul>
			{/if}

			<div class="mb-1 mt-4">
				<h2 class="text-xs font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500">Diary</h2>
			</div>
			{#if summary.orders.length === 0}
				<p class="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 px-4 py-8 text-center text-sm text-stone-500 dark:text-stone-400">No orders yet. Add the first buy.</p>
			{:else if orgId === 'ripio'}
				<div class="max-w-full overflow-x-auto rounded-2xl border border-stone-200 dark:border-stone-800">
					<table class="w-full min-w-[780px] border-collapse text-left text-[11px] tabular-nums">
						<thead>
							<tr class="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 text-stone-500 dark:text-stone-400">
								<th scope="col" class="px-2 py-1.5 font-medium">Date</th>
								<th scope="col" class="px-2 py-1.5 font-medium">Operation</th>
								<th scope="col" class="px-2 py-1.5 text-right font-medium">Qty</th>
								<th scope="col" class="px-2 py-1.5 text-right font-medium">Price</th>
								<th scope="col" class="px-2 py-1.5 text-right font-medium">Value</th>
								<th scope="col" class="px-2 py-1.5 text-right font-medium">Fee</th>
								<th scope="col" class="px-2 py-1.5 text-right font-medium">Goal</th>
								<th scope="col" class="px-2 py-1.5 text-right font-medium">Goal price</th>
								<th scope="col" class="px-2 py-1.5 text-right font-medium">Net</th>
								<th scope="col" class="w-14 px-1 py-1.5"><span class="sr-only">Edit or delete</span></th>
							</tr>
						</thead>
						<tbody>
							{#each [...summary.orders].reverse() as o (o.id)}
								<tr class="border-b border-stone-100 dark:border-stone-800/70 last:border-0 text-stone-700 dark:text-stone-300">
									<td class="whitespace-nowrap px-2 py-1.5 text-stone-500 dark:text-stone-400">{fmtDate(o.date)} · {shortDuration(o.date, ageLang)}</td>
									<td class="whitespace-nowrap px-2 py-1.5 font-semibold"><span class={o.side === 'BUY' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>{o.side}</span></td>
									<td class="whitespace-nowrap px-2 py-1.5 text-right">{fmtCoin(o.qty)} {coinLabel(o.ticker, orgId)}</td>
									<td class="px-2 py-1.5 text-right">{fmtMoney(o.unitPrice)}</td>
									<td class="px-2 py-1.5 text-right">{fmtMoney(o.value)}</td>
									<td class="px-2 py-1.5 text-right">
										<span class="inline-flex items-center justify-end gap-1">
											{fmtMoney(roundTripFee(o.fees))}
											{#if o.value > 0}
												<span class="text-stone-400 dark:text-stone-500">({((roundTripFee(o.fees) / o.value) * 100).toFixed(2)}%)</span>
											{/if}
											{#if feeBothWays}
												<span title="Total fee: charged on both buy and sell" class="inline-flex">
													<ArrowRightLeft class="h-3 w-3 shrink-0 text-stone-400 dark:text-stone-500" />
												</span>
											{/if}
										</span>
									</td>
									<td class="px-2 py-1.5 text-right">{(o.targetPct * 100).toFixed(1)}%</td>
									<td class="px-2 py-1.5 text-right">{o.side === 'SELL' ? '—' : fmtMoney(o.goalPrice)}</td>
									<td class="px-2 py-1.5 text-right" title={o.side === 'SELL' ? 'Net of the sale' : 'What the position nets if sold at the goal price'}>{o.side === 'SELL' ? fmtMoney(o.net) : fmtMoney(o.netAtGoal)}</td>
									<td class="px-1 py-1.5 text-center">
										{#if o.id === latestOrderId}
											<span class="inline-flex items-center gap-0.5">
												<button
													type="button"
													aria-label="Edit latest order"
													class="grid h-6 w-6 place-items-center rounded-full text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-700 dark:hover:text-stone-200"
													onclick={() => startEditOrder(o)}
												><Pencil class="h-3 w-3" /></button>
												<button
													type="button"
													aria-label="Delete latest order"
													class="grid h-6 w-6 place-items-center rounded-full text-base leading-none text-stone-300 dark:text-stone-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-400"
													onclick={() => (confirmingOrder = o.id)}
												>&times;</button>
											</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{:else}
				<div class="max-w-full overflow-x-auto rounded-2xl border border-stone-200 dark:border-stone-800">
					<table class="w-full min-w-[640px] border-collapse text-left text-[11px] tabular-nums">
						<thead>
							<tr class="border-b border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900 text-stone-500 dark:text-stone-400">
								<th scope="col" class="px-2 py-1.5 font-medium">Date</th>
								<th scope="col" class="px-2 py-1.5 font-medium">Operation</th>
								<th scope="col" class="px-2 py-1.5 text-right font-medium">Qty</th>
								<th scope="col" class="px-2 py-1.5 text-right font-medium">Unit</th>
								<th scope="col" class="px-2 py-1.5 text-right font-medium">Value</th>
								<th scope="col" class="px-2 py-1.5 text-right font-medium">{orgId === 'ripio' ? 'Fee' : 'B3 fee'}</th>
								{#if orgId !== 'ripio'}
									<th scope="col" class="px-2 py-1.5 text-right font-medium">Dedo-duro</th>
								{/if}
								<th scope="col" class="px-2 py-1.5 text-right font-medium">Net</th>
								<th scope="col" class="px-2 py-1.5 text-right font-medium">Profit</th>
								<th scope="col" class="w-14 px-1 py-1.5"><span class="sr-only">Edit or delete</span></th>
							</tr>
						</thead>
						<tbody>
							{#each [...summary.orders].reverse() as o (o.id)}
								<tr class="border-b border-stone-100 dark:border-stone-800/70 last:border-0 text-stone-700 dark:text-stone-300">
									<td class="whitespace-nowrap px-2 py-1.5 text-stone-500 dark:text-stone-400">{fmtDate(o.date)} · {shortDuration(o.date, ageLang)}</td>
									<td class="whitespace-nowrap px-2 py-1.5 font-semibold"><span class={o.side === 'BUY' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>{o.side}</span> {coinLabel(o.ticker, orgId)}</td>
									<td class="px-2 py-1.5 text-right">{fmtNum(o.qty, 0)}</td>
									<td class="px-2 py-1.5 text-right">{fmtMoney(o.unitPrice)}</td>
									<td class="px-2 py-1.5 text-right">{fmtMoney(o.value)}</td>
									<td class="px-2 py-1.5 text-right">
										<span class="inline-flex items-center justify-end gap-1">
											{fmtMoney(roundTripFee(o.fees))}
											{#if o.value > 0}
												<span class="text-stone-400 dark:text-stone-500">({((roundTripFee(o.fees) / o.value) * 100).toFixed(2)}%)</span>
											{/if}
											{#if feeBothWays}
												<span title="Total fee: charged on both buy and sell" class="inline-flex">
													<ArrowRightLeft class="h-3 w-3 shrink-0 text-stone-400 dark:text-stone-500" />
												</span>
											{/if}
										</span>
									</td>
									{#if orgId !== 'ripio'}
										<td class="px-2 py-1.5 text-right">{o.side === 'SELL' ? fmtMoney(o.irrf) : '—'}</td>
									{/if}
									<td class="px-2 py-1.5 text-right">{fmtMoney(o.net)}</td>
									<td class="px-2 py-1.5 text-right font-medium {o.side === 'SELL' ? (o.profit !== null && o.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400') : 'text-stone-400 dark:text-stone-500'}">{o.side === 'SELL' && o.profit !== null ? `${o.profit >= 0 ? '+' : ''}${fmtMoney(o.profit)}${o.profitPct !== null ? ` (${o.profitPct >= 0 ? '+' : ''}${o.profitPct.toFixed(2)}%)` : ''}` : '—'}</td>
									<td class="px-1 py-1.5 text-center">
										{#if o.id === latestOrderId}
											<span class="inline-flex items-center gap-0.5">
												<button
													type="button"
													aria-label="Edit latest order"
													class="grid h-6 w-6 place-items-center rounded-full text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-700 dark:hover:text-stone-200"
													onclick={() => startEditOrder(o)}
												><Pencil class="h-3 w-3" /></button>
												<button
													type="button"
													aria-label="Delete latest order"
													class="grid h-6 w-6 place-items-center rounded-full text-base leading-none text-stone-300 dark:text-stone-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-400"
													onclick={() => (confirmingOrder = o.id)}
												>&times;</button>
											</span>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		{:else if org && org.enabled && org.id !== 'ripio'}
			<p class="py-6 text-center text-xs text-stone-400 dark:text-stone-500">Loading…</p>
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

{#if detailTicker}
	{@const dp = summary?.positions.find((x) => x.ticker === detailTicker)}
	{#if dp}
		<TradingPositionModal
			p={dp}
			age={openAge(dp.since, ageLang)}
			onEditTarget={() => startTarget(dp.ticker, dp.targetPct)}
			onClose={() => (detailTicker = null)}
		/>
	{/if}
{/if}

{#if orderOpen}
	{@const side = orderOpen}
	<div
		class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 dark:bg-black/60 backdrop-blur-md p-4"
		role="dialog"
		aria-modal="true"
		aria-label="{editingOrderId ? 'Edit' : 'New'} {side === 'BUY' ? 'buy' : 'sale'}"
		tabindex="-1"
		onclick={(e) => { if (e.target === e.currentTarget) closeOrder(); }}
		onkeydown={(e) => { if (e.key === 'Escape') closeOrder(); }}
		transition:fade={{ duration: motionMs(BACKDROP_MS) }}
	>
		<div class="w-full max-w-sm rounded-2xl bg-white dark:bg-stone-900 p-5 shadow-xl" transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}>
			<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">{editingOrderId ? 'Edit' : 'New'} {side === 'BUY' ? 'buy' : 'sale'}</h2>
			{#if editingOrderId}
				<p class="mt-1 text-[11px] leading-snug text-stone-400 dark:text-stone-500">Correct the latest order. Value, fees and net are recomputed with the rates recorded with it; the ticker and side stay.</p>
				{#if editCosts}
					<div class="mt-3 rounded-xl bg-stone-100 dark:bg-stone-800 px-3 py-2 text-[11px] tabular-nums leading-relaxed text-stone-600 dark:text-stone-300">
						<p class="text-[9px] font-semibold uppercase tracking-wider text-stone-400 dark:text-stone-500">Costs at the buy</p>
						<p>
							fee {editCosts.feeRatePct.toFixed(2)}%{#if editCosts.feeRatePct > 0}
								<span class="text-stone-400 dark:text-stone-500">· total {(editCosts.feeRatePct * 2).toFixed(2)}% (buy + sell)</span>
							{/if}
						</p>
						{#if editCosts.irrfRatePct > 0}
							<p>dedo-duro {editCosts.irrfRatePct.toFixed(2)}%</p>
						{/if}
						{#if editCosts.spreadRatePct > 0}
							<p>spread {editCosts.spreadRatePct.toFixed(2)}%</p>
						{/if}
						{#if editCosts.fixedFee > 0}
							<p>fixed {fmtMoney(editCosts.fixedFee)}</p>
						{/if}
						{#if editFeePreview}
							<p class="mt-0.5">{fmtMoney(editFeePreview.fee)} this order{#if editCosts.feeRatePct > 0} · {fmtMoney(editFeePreview.both)} both ways{/if}</p>
						{/if}
						<p class="mt-0.5 text-stone-400 dark:text-stone-500">Fixed when the order was recorded. Change rules in Fees; new buys use the new values.</p>
					</div>
				{/if}
			{:else if side === 'SELL'}
				<p class="mt-1 text-[11px] leading-snug text-stone-400 dark:text-stone-500">A sale always closes the full position. Enter the full open quantity.</p>
			{/if}
			<label class="mt-3 block text-xs font-medium text-stone-500 dark:text-stone-400" for="trade-ticker">{orgId === 'ripio' ? 'Coin' : 'Ticker'}</label>
			<div class="relative">
				<input
					id="trade-ticker"
					class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base uppercase text-stone-800 dark:text-stone-200 outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-stone-400 dark:focus:border-stone-600 disabled:opacity-60"
					disabled={editingOrderId !== null}
					aria-label={orgId === 'ripio' ? 'Coin' : 'Ticker'}
					aria-expanded={tickerFocus && tickerSuggestions.length > 0}
					aria-controls="ticker-listbox"
					aria-activedescendant={tickerFocus && tickerSuggestions[tickerActive] ? `ticker-${tickerSuggestions[tickerActive]}` : undefined}
					role="combobox"
					aria-autocomplete="list"
					autocomplete="off"
					placeholder={orgId === "ripio" ? "BTC" : "PETR4"}
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
						if (fTicker.trim()) fGoal = goalFor(fTicker);
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
						type="number" step="any" min="0"
						placeholder="2"
						value={fQty}
						oninput={(e) => (fQty = e.currentTarget.value)}
					/>
				</div>
				<div>
					<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="trade-price">Unit price ({orgId === 'ripio' ? 'US$' : 'R$'})</label>
					<input
						id="trade-price"
						class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base text-stone-800 dark:text-stone-200 outline-none focus:border-stone-400 dark:focus:border-stone-600"
						aria-label="Unit price"
						type="number" step="any" min="0"
						placeholder="38.50"
						value={fPrice}
						oninput={(e) => (fPrice = e.currentTarget.value)}
					/>
				</div>
				{#if orderOpen === 'BUY'}
					<div class="col-span-2">
						<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="trade-goal">Goal %</label>
						<input
							id="trade-goal"
							class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base text-stone-800 dark:text-stone-200 outline-none focus:border-stone-400 dark:focus:border-stone-600"
							aria-label="Goal %"
							type="number" step="any" min="0"
							placeholder="3"
							value={fGoal}
							oninput={(e) => (fGoal = e.currentTarget.value)}
						/>
						<p class="mt-1 text-[11px] leading-snug text-stone-400 dark:text-stone-500">
							Net profit over the total cost, after the venue fee. Change it later from the trade detail.
						</p>
					</div>
				{/if}
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
					onclick={closeOrder}
				>Cancel</button>
				<button
					type="button"
					class="rounded-full bg-stone-900 dark:bg-stone-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-stone-800 dark:hover:bg-stone-600"
					onclick={() => void saveOrder()}
				>{editingOrderId ? 'Save changes' : `Save ${side === 'BUY' ? 'buy' : 'sale'}`}</button>
			</div>
		</div>
	</div>
{/if}

{#if sellPos}
	<div
		class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 dark:bg-black/60 backdrop-blur-md p-4"
		role="dialog"
		aria-modal="true"
		aria-label="Sell all {coinLabel(sellPos.ticker, orgId)}"
		tabindex="-1"
		onclick={(e) => { if (e.target === e.currentTarget) closeSell(); }}
		onkeydown={(e) => { if (e.key === 'Escape') closeSell(); }}
		transition:fade={{ duration: motionMs(BACKDROP_MS) }}
	>
		<div class="w-full max-w-sm rounded-2xl bg-white dark:bg-stone-900 p-5 shadow-xl" transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}>
			<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">Sell all {coinLabel(sellPos.ticker, orgId)}</h2>
			<p class="mt-1 text-[11px] leading-snug text-stone-400 dark:text-stone-500">
				A sale closes the whole position: {fmtCoin(sellPos.qty)} {coinLabel(sellPos.ticker, orgId)}. Record the unit price the venue offers you.
			</p>
			<label class="mt-3 block text-xs font-medium text-stone-500 dark:text-stone-400" for="sell-price">Sale price ({orgId === 'ripio' ? 'US$' : 'R$'})</label>
			<input
				id="sell-price"
				class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base text-stone-800 dark:text-stone-200 outline-none focus:border-stone-400 dark:focus:border-stone-600"
				type="number" step="any" min="0"
				value={sellPrice}
				oninput={(e) => (sellPrice = e.currentTarget.value)}
			/>
			<label class="mt-3 block text-xs font-medium text-stone-500 dark:text-stone-400" for="sell-date">Date</label>
			<input
				id="sell-date"
				type="date"
				class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base text-stone-800 dark:text-stone-200 outline-none focus:border-stone-400 dark:focus:border-stone-600"
				value={sellDate}
				oninput={(e) => (sellDate = e.currentTarget.value)}
			/>
			{#if sellPreview}
				{@const profit = sellPreview.net - sellPos.cost}
				{@const profitPct = sellPos.cost > 0 ? (profit / sellPos.cost) * 100 : null}
				<p class="mt-3 text-[11px] tabular-nums text-stone-500 dark:text-stone-400">
					Gross {fmtMoney(sellPreview.value)} · net after fees {fmtMoney(sellPreview.net)} · cost {fmtMoney(sellPos.cost)}
				</p>
				<p class="mt-1 flex items-center gap-1 text-[11px] font-medium tabular-nums {profit > 0 ? 'text-emerald-600 dark:text-emerald-400' : profit < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-stone-500 dark:text-stone-400'}" title="Net proceeds minus the cost paid, after every venue fee">
					{#if profit > 0}<TrendingUp class="h-3 w-3 shrink-0" />{:else if profit < 0}<TrendingDown class="h-3 w-3 shrink-0" />{/if}
					<span>{profit >= 0 ? 'Earns' : 'Loses'} {fmtMoney(Math.abs(profit))}{#if profitPct !== null} ({profit >= 0 ? '+' : '−'}{Math.abs(profitPct).toFixed(2)}%){/if}</span>
				</p>
				{#if profit < 0}
					<p class="mt-1 text-[11px] font-medium text-rose-600 dark:text-rose-400">Below cost after fees — this sale loses money.</p>
				{/if}
			{/if}
			<div class="mt-4 flex justify-end gap-2">
				<button
					type="button"
					class="rounded-full border border-stone-200 dark:border-stone-800 px-4 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
					onclick={closeSell}
				>Cancel</button>
				<button
					type="button"
					class="rounded-full bg-rose-600 px-4 py-1.5 text-xs font-medium text-white hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-600"
					onclick={confirmSale}
				>Sell all</button>
			</div>
		</div>
	</div>
{/if}

{#if confirmingSale}
	<ConfirmDialog
		title="Record the sale of {coinLabel(confirmingSale.ticker, orgId)}?"
		message={`Sell all ${fmtCoin(confirmingSale.qty)} at ${fmtMoney(confirmingSale.price)}${sellPreview ? ` for a net of ${fmtMoney(sellPreview.net)}` : ''}. The position closes and the row enters the diary.`}
		confirmLabel="Record sale"
		cancelLabel="Cancel"
		confirmTone="danger"
		onConfirm={() => void saveSale()}
		onCancel={() => (confirmingSale = null)}
	/>
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
			<p class="mt-1 text-[11px] leading-snug text-stone-400 dark:text-stone-500">
				{#if orgId === 'ripio'}
					One percentage, charged on every buy and every sale. Write what it covers in the comment. New orders use this value; past orders keep theirs.
				{:else}
					Fees apply to buys and sales. Dedo-duro applies to sales only. New orders use these values; past orders keep theirs.
				{/if}
			</p>
			<div class="mt-3 grid gap-2 {orgId === 'ripio' ? '' : 'grid-cols-2'}">
				<div>
					<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="org-fee">Fee %</label>
					<input
						id="org-fee"
						class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base text-stone-800 dark:text-stone-200 outline-none focus:border-stone-400 dark:focus:border-stone-600"
						type="number" step="any" min="0"
						value={sFee}
						oninput={(e) => (sFee = e.currentTarget.value)}
					/>
				</div>
					{#if orgId === 'ripio'}
					<div>
						<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="org-note">Comment</label>
						<input
							id="org-note"
							class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base text-stone-800 dark:text-stone-200 outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-stone-400 dark:focus:border-stone-600"
							type="text"
							maxlength="160"
							placeholder="What this fee covers"
							value={sNote}
							oninput={(e) => (sNote = e.currentTarget.value)}
						/>
					</div>
				{:else}
					<div>
						<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="org-irrf">Dedo-duro %</label>
						<input
							id="org-irrf"
							class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base text-stone-800 dark:text-stone-200 outline-none focus:border-stone-400 dark:focus:border-stone-600"
							type="number" step="any" min="0"
							value={sIrrf}
							oninput={(e) => (sIrrf = e.currentTarget.value)}
						/>
					</div>
					<div>
						<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="org-fixed">Fixed fee (R$)</label>
						<input
							id="org-fixed"
							class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base text-stone-800 dark:text-stone-200 outline-none focus:border-stone-400 dark:focus:border-stone-600"
							type="number" step="any" min="0"
							value={sFixed}
							oninput={(e) => (sFixed = e.currentTarget.value)}
						/>
					</div>
					<div>
						<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="org-limit">Monthly limit (R$)</label>
						<input
							id="org-limit"
							class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base text-stone-800 dark:text-stone-200 outline-none focus:border-stone-400 dark:focus:border-stone-600"
							type="number" step="any" min="0"
							value={sLimit}
							oninput={(e) => (sLimit = e.currentTarget.value)}
						/>
					</div>
				{/if}
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
			<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">Goal for {coinLabel(targetTicker, orgId)}</h2>
			<label class="mt-3 block text-xs font-medium text-stone-500 dark:text-stone-400" for="target-pct">Goal %</label>
			<input
				id="target-pct"
				class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base text-stone-800 dark:text-stone-200 outline-none focus:border-stone-400 dark:focus:border-stone-600"
				type="number" step="any" min="0"
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
