<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { slide } from 'svelte/transition';
	import { motionMs } from '$lib/motion';
	import TradingPositionCard from '$lib/components/TradingPositionCard.svelte';
	import TradingPositionModal from '$lib/components/TradingPositionModal.svelte';
	import type { TradingStripItem } from '$lib/types';
	import { showToast } from '$lib/toast.svelte';

	// Home-page strip below the holdings carousel: same card rail, one card
	// per open trading ticker. Tapping a card opens Businesses → Trading.
	type Props = {
		onOpen: () => void;
		onError: (msg: string) => void;
		bare?: boolean;
		/** The admin layout owns the quote refresh so it can update holdings too. */
		onRefreshTicker?: (ticker: string) => void;
		refreshingTicker?: string | null;
	};
	let { onOpen, onError, bare = false, onRefreshTicker, refreshingTicker = null }: Props = $props();

	let positions = $state<TradingStripItem[] | null>(null);
	let refreshing = $state(false);
	let selected = $state<TradingStripItem | null>(null);

	const COLLAPSED_KEY = 'ferm:trading-collapsed';
	let collapsed = $state(false);

	// Goal-hit alert: a position whose quote reaches or passes its target
	// pings once through the global sound toast. Edge-triggered per
	// orgId:ticker and remembered in storage, so the 60-second reload and a
	// page reload never repeat an alert; falling below the target forgets
	// the key, and a closed position is forgotten too.
	const ALERT_KEY = 'ferm:trading-goal-alerts';
	let alerted: Set<string> | null = null;

	function loadAlerted(): Set<string> {
		if (alerted) return alerted;
		alerted = new Set();
		try {
			const raw = JSON.parse(localStorage.getItem(ALERT_KEY) ?? '[]') as unknown;
			if (Array.isArray(raw)) for (const k of raw) if (typeof k === 'string') alerted.add(k);
		} catch {
			// Bad storage just means the session alerts from scratch.
		}
		return alerted;
	}

	function checkGoalAlerts(items: TradingStripItem[]) {
		const set = loadAlerted();
		const key = (p: TradingStripItem) => `${p.orgId}:${p.ticker}`;
		// 'sell' and 'daytrade' are exactly "at or above the target" with a
		// live quote; 'hold' and 'waiting' are not (see journal strip build).
		const hits = items.filter((p) => p.recommendation === 'sell' || p.recommendation === 'daytrade');
		const hitKeys = new Set(hits.map(key));
		let changed = false;
		for (const k of [...set]) if (!hitKeys.has(k)) { set.delete(k); changed = true; }
		const fresh = hits.filter((p) => !set.has(key(p)));
		for (const p of fresh) { set.add(key(p)); changed = true; }
		if (!changed) return;
		try {
			localStorage.setItem(ALERT_KEY, JSON.stringify([...set]));
		} catch {}
		if (fresh.length === 0) return;
		if (fresh.length === 1) {
			const p = fresh[0];
			showToast(`${p.ticker} reached its target — goal ${(p.targetPct * 100).toFixed(1)}%, now ${(p.potentialPct ?? 0).toFixed(1)}%`, 'success', true);
		} else {
			showToast(`${fresh.length} positions reached their target — ${fresh.map((p) => p.ticker).join(', ')}`, 'success', true);
		}
	}

	$effect(() => {
		try {
			collapsed = localStorage.getItem(COLLAPSED_KEY) === '1';
		} catch {}
	});

	function toggleCollapsed() {
		collapsed = !collapsed;
		try {
			localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
		} catch {}
	}

	async function load() {
		try {
			const d = await (await fetch('/api/trading/strip')).json();
			positions = Array.isArray(d.positions) ? d.positions : [];
			checkGoalAlerts(positions ?? []);
			// A position without a quote has never been refreshed: fetch once.
			if ((positions ?? []).some((p) => p.quote === null)) await refresh(true);
		} catch {
			onError('Failed to load open trades.');
		}
	}

	async function refresh(quiet = false) {
		const orgs = [...new Set((positions ?? []).map((p) => p.orgId))];
		if (orgs.length === 0) return;
		try {
			if (!quiet) refreshing = true;
			for (const org of orgs) {
				await fetch(`/api/trading/summary?org=${encodeURIComponent(org)}&refresh=1`);
			}
			const d = await (await fetch('/api/trading/strip')).json();
			positions = Array.isArray(d.positions) ? d.positions : [];
			checkGoalAlerts(positions ?? []);
		} catch {
			if (!quiet) onError('Failed to refresh trade quotes.');
		} finally {
			refreshing = false;
		}
	}

	$effect(() => {
		void load();
		const onChange = () => void load();
		const onVisible = () => {
			if (!document.hidden) void load();
		};
		const timer = setInterval(() => void load(), 60000);
		window.addEventListener('trading:changed', onChange);
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			clearInterval(timer);
			window.removeEventListener('trading:changed', onChange);
			document.removeEventListener('visibilitychange', onVisible);
		};
	});
</script>

{#if positions !== null}
	{#if !bare}
	<div class="mb-1 flex items-center gap-1">
		<button
			type="button"
			class="flex min-w-0 items-center gap-1 rounded-full pr-2 text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300"
			aria-expanded={!collapsed}
			aria-label={collapsed ? 'Expand trading' : 'Collapse trading'}
			onclick={toggleCollapsed}
		>
			<span class="grid h-6 w-6 shrink-0 place-items-center">
				<ChevronDown class="h-4 w-4 transition-transform duration-200 motion-reduce:transition-none {collapsed ? '-rotate-90' : ''}" />
			</span>
			<span class="text-xs font-medium uppercase tracking-widest">Trading</span>
		</button>
	</div>
	{/if}
	{#if bare || !collapsed}
		{#if (positions ?? []).length === 0}
			<button
				type="button"
				class="block w-full rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 px-4 py-6 text-center text-sm text-stone-500 dark:text-stone-400"
				aria-label="Open Trading"
				onclick={onOpen}
			>No open trades — record the first buy in Trading.</button>
		{:else}
			<div
				class="flex snap-x items-stretch gap-2 overflow-x-auto no-scrollbar pb-1"
				role="list"
				aria-label="Open trades"
				transition:slide={{ duration: motionMs(180) }}
			>
			{#each positions ?? [] as p (p.orgId + p.ticker)}
				<div role="listitem" class="flex w-40 shrink-0 snap-start">
					<button
						type="button"
						class="w-full text-left"
						aria-label="Open {p.ticker} details"
						aria-haspopup="dialog"
						onclick={() => (selected = p)}
					>
						<TradingPositionCard
							p={{ ...p, quoteSource: null }}
							compact
							onRefresh={onRefreshTicker ? () => onRefreshTicker(p.ticker) : undefined}
							refreshing={refreshingTicker === p.ticker}
						/>
					</button>
				</div>
			{/each}
			</div>
		{/if}
	{/if}
{/if}

{#if selected}
	{@const s = selected}
	<TradingPositionModal
		p={{ ...s, quoteSource: null }}
		showOpen
		onOpen={() => { selected = null; onOpen(); }}
		onClose={() => (selected = null)}
	/>
{/if}
