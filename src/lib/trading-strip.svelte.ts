import { showToast } from '$lib/toast.svelte';
import type { TradingStripItem, TradingStripTotals } from '$lib/types';

// Owns the home-page trading rail: positions, money totals and the goal
// alerts. It lives outside the collapsed section body on purpose — a
// collapse unmounts its children, so a component inside the body would stop
// fetching and the collapsed header would have no totals to show.

const ALERT_KEY = 'ferm:trading-goal-alerts';

class TradingStripStore {
	positions = $state<TradingStripItem[] | null>(null);
	totals = $state<TradingStripTotals | null>(null);
	#alerted: Set<string> | null = null;
	#started = false;

	#loadAlerted(): Set<string> {
		if (this.#alerted) return this.#alerted;
		this.#alerted = new Set();
		try {
			const raw = JSON.parse(localStorage.getItem(ALERT_KEY) ?? '[]') as unknown;
			if (Array.isArray(raw)) for (const k of raw) if (typeof k === 'string') this.#alerted.add(k);
		} catch {
			// Bad storage just means the session alerts from scratch.
		}
		return this.#alerted;
	}

	// Goal-hit alert: a position whose quote reaches or passes its target
	// pings once through the global sound toast. Edge-triggered per
	// orgId:ticker and remembered in storage, so the 60-second reload and a
	// page reload never repeat an alert; falling below the target forgets
	// the key, and a closed position is forgotten too.
	#checkGoalAlerts(items: TradingStripItem[]) {
		const set = this.#loadAlerted();
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

	async load(): Promise<void> {
		try {
			const d = (await (await fetch('/api/trading/strip')).json()) as {
				positions?: TradingStripItem[];
				totals?: TradingStripTotals;
			};
			this.positions = Array.isArray(d.positions) ? d.positions : [];
			this.totals = d.totals ?? null;
			this.#checkGoalAlerts(this.positions);
			// A position without a quote has never been refreshed: fetch once.
			if (this.positions.some((p) => p.quote === null)) await this.refresh(true);
		} catch {
			showToast('Failed to load open trades.');
		}
	}

	async refresh(quiet = false): Promise<void> {
		const orgs = [...new Set((this.positions ?? []).map((p) => p.orgId))];
		if (orgs.length === 0) return;
		try {
			for (const org of orgs) {
				await fetch(`/api/trading/summary?org=${encodeURIComponent(org)}&refresh=1`);
			}
			await this.load();
		} catch {
			if (!quiet) showToast('Failed to refresh trade quotes.');
		}
	}

	/** Start the single 60-second reload and its change triggers. Safe to
	 *  call twice: the second call is a no-op. */
	start(): () => void {
		if (this.#started) return () => {};
		this.#started = true;
		void this.load();
		const onChange = () => void this.load();
		const onVisible = () => {
			if (!document.hidden) void this.load();
		};
		const timer = setInterval(() => void this.load(), 60000);
		window.addEventListener('trading:changed', onChange);
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			clearInterval(timer);
			window.removeEventListener('trading:changed', onChange);
			document.removeEventListener('visibilitychange', onVisible);
			this.#started = false;
		};
	}
}

export const tradingStrip = new TradingStripStore();
