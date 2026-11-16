<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import { fmtCurrency } from '$lib/currency';
	import { parseDecimal } from '$lib/numbers';
	import { loading } from '$lib/loading.svelte';
	import { shortDuration, openAge, type AgeLang } from '$lib/age';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
import CollapsibleSection from '$lib/components/CollapsibleSection.svelte';
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
	let confirmingOrder = $state<string | null>(null);
	let targetTicker = $state<string | null>(null);
	let detailTicker = $state<string | null>(null);
	let confirmingDisable = $state<TradingOrg | null>(null);
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
			confirmingDisable = null;
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
			const [r] = await Promise.all([
				fetch(`/api/quotes/ripio?pair=BTC_USDC${f}`).then((res) => res.json()),
				fetch(`/api/quotes/btc-global${f}`)
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

	const btcCompare = $derived.by(() => {
		if (!ripio || !globalBtc) return null;
		const value = ripio.priceUsd - globalBtc.priceUsd;
		const pct = globalBtc.priceUsd > 0 ? (value / globalBtc.priceUsd) * 100 : null;
		return { value, pct };
	});

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
		void reload();
		const onChange = () => {
			void loadSummary();
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
		const qty = parseDecimal(fQty);
		const price = parseDecimal(fPrice);
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
			return parseDecimal(v);
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
					<button
						type="button"
						class="rounded-full bg-rose-600 px-3 py-1 text-xs font-medium text-white hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-600"
						onclick={() => startOrder('SELL')}
					>− Sell</button>
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

			{#if q && q.bid !== null && q.ask !== null && globalBtc}
				<!-- With a signed quote the comparison is side-aware: a buy
					pays the ask, a sale receives the bid. Mid-gap alone would
					hide the venue spread. -->
				{@const mid = (q.ask + q.bid) / 2}
				{@const spread = q.ask - q.bid}
				{@const buyGap = q.ask - globalBtc.priceUsd}
				{@const sellGap = q.bid - globalBtc.priceUsd}
				<div class="mt-2 space-y-0.5 text-center text-[11px] tabular-nums text-stone-500 dark:text-stone-400">
					<p>Ripio spread buy−sell: {fmtMoney(spread, 'USD', 2)} ({mid > 0 ? ((spread / mid) * 100).toFixed(2) : '—'}%)</p>
					<p class={buyGap < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
						Buy pays {fmtMoney(q.ask, 'USD', 2)} · {buyGap >= 0 ? '+' : '−'}{fmtMoney(Math.abs(buyGap), 'USD', 2)} ({globalBtc.priceUsd > 0 ? (buyGap / globalBtc.priceUsd * 100).toFixed(2) : '—'}%) vs Coinbase
					</p>
					<p class={sellGap < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}>
						Sell gets {fmtMoney(q.bid, 'USD', 2)} · {sellGap >= 0 ? '+' : '−'}{fmtMoney(Math.abs(sellGap), 'USD', 2)} ({globalBtc.priceUsd > 0 ? (sellGap / globalBtc.priceUsd * 100).toFixed(2) : '—'}%) vs Coinbase
					</p>
				</div>
			{:else if btcCompare}
				<p class="mt-2 text-center text-[11px] font-medium tabular-nums {btcCompare.value < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600 dark:text-emerald-400'}">
					Ripio vs Coinbase: {btcCompare.value >= 0 ? '+' : '−'}{fmtMoney(Math.abs(btcCompare.value), 'USD', 2)}{#if btcCompare.pct !== null} ({btcCompare.pct >= 0 ? '+' : '−'}{Math.abs(btcCompare.pct).toFixed(2)}%){/if}
				</p>
			{/if}

			<div class="mt-3 flex items-center justify-center gap-2">
				<button
					type="button"
					class="inline-flex items-center gap-1 rounded-full border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-1 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40"
					disabled={ripioLoading}
					onclick={() => { void loadRipio(true); void loadSummary(true, true); }}
				>{ripioLoading ? 'Updating…' : 'Refresh'}</button>
				<button
					type="button"
					class="rounded-full px-3 py-1 text-xs font-medium text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300"
					disabled={orgLoading}
					onclick={() => { if (org) confirmingDisable = org; }}
				>Disable</button>
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
									aria-label="Open {p.ticker} details"
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
								<th scope="col" class="px-2 py-1.5 text-right font-medium">B3 fee</th>
								<th scope="col" class="px-2 py-1.5 text-right font-medium">Dedo-duro</th>
								<th scope="col" class="px-2 py-1.5 text-right font-medium">Net</th>
								<th scope="col" class="px-2 py-1.5 text-right font-medium">Profit</th>
								<th scope="col" class="w-8 px-1 py-1.5"><span class="sr-only">Delete</span></th>
							</tr>
						</thead>
						<tbody>
							{#each [...summary.orders].reverse() as o (o.id)}
								<tr class="border-b border-stone-100 dark:border-stone-800/70 last:border-0 text-stone-700 dark:text-stone-300">
									<td class="whitespace-nowrap px-2 py-1.5 text-stone-500 dark:text-stone-400">{fmtDate(o.date)} · {shortDuration(o.date, ageLang)}</td>
									<td class="whitespace-nowrap px-2 py-1.5 font-semibold"><span class={o.side === 'BUY' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>{o.side}</span> {o.ticker}</td>
									<td class="px-2 py-1.5 text-right">{fmtNum(o.qty, 0)}</td>
									<td class="px-2 py-1.5 text-right">{fmtMoney(o.unitPrice)}</td>
									<td class="px-2 py-1.5 text-right">{fmtMoney(o.value)}</td>
									<td class="px-2 py-1.5 text-right">{fmtMoney(o.fees)}</td>
									<td class="px-2 py-1.5 text-right">{o.side === 'SELL' ? fmtMoney(o.irrf) : '—'}</td>
									<td class="px-2 py-1.5 text-right">{fmtMoney(o.net)}</td>
									<td class="px-2 py-1.5 text-right font-medium {o.side === 'SELL' ? (o.profit !== null && o.profit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400') : 'text-stone-400 dark:text-stone-500'}">{o.side === 'SELL' && o.profit !== null ? `${o.profit >= 0 ? '+' : ''}${fmtMoney(o.profit)}${o.profitPct !== null ? ` (${o.profitPct >= 0 ? '+' : ''}${o.profitPct.toFixed(1)}%)` : ''}` : '—'}</td>
									<td class="px-1 py-1.5 text-center">
										{#if o.id === latestOrderId}
											<button
												type="button"
												aria-label="Delete latest order"
												class="grid h-6 w-6 place-items-center rounded-full text-base leading-none text-stone-300 dark:text-stone-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 dark:hover:text-rose-400"
												onclick={() => (confirmingOrder = o.id)}
											>&times;</button>
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

{#if confirmingDisable}
	{@const cd = confirmingDisable}
	<ConfirmDialog
		title="Disable {cd.name}?"
		message="The venue leaves the switcher until re-enabled. Orders and quotes stay stored."
		confirmLabel="Disable venue"
		cancelLabel="Cancel"
		confirmTone="danger"
		onConfirm={() => void setOrgEnabled(cd.id, false)}
		onCancel={() => (confirmingDisable = null)}
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
					placeholder={orgId === "ripio" ? "BTC_USDC" : "PETR4"}
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
						type="number" step="any" min="0"
						value={sFee}
						oninput={(e) => (sFee = e.currentTarget.value)}
					/>
				</div>
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
					<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="org-fixed">Fixed fee ({orgId === 'ripio' ? 'US$' : 'R$'})</label>
					<input
						id="org-fixed"
						class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base text-stone-800 dark:text-stone-200 outline-none focus:border-stone-400 dark:focus:border-stone-600"
						type="number" step="any" min="0"
						value={sFixed}
						oninput={(e) => (sFixed = e.currentTarget.value)}
					/>
				</div>
				<div>
					<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="org-limit">Monthly limit ({orgId === 'ripio' ? 'US$' : 'R$'})</label>
					<input
						id="org-limit"
						class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base text-stone-800 dark:text-stone-200 outline-none focus:border-stone-400 dark:focus:border-stone-600"
						type="number" step="any" min="0"
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
