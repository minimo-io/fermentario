<script lang="ts">
	import Plus from '@lucide/svelte/icons/plus';
	import RefreshCw from '@lucide/svelte/icons/refresh-cw';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { slide } from 'svelte/transition';
	import { motionMs } from '$lib/motion';
	import HoldingModal, { blankHoldingDraft } from '$lib/components/HoldingModal.svelte';
	import type { HoldingDraft } from '$lib/components/HoldingModal.svelte';
	import HoldingActionsModal from '$lib/components/HoldingActionsModal.svelte';
	import AllocationModal from '$lib/components/AllocationModal.svelte';
	import GoalsModal from '$lib/components/GoalsModal.svelte';
	import type { Holding, HoldingAction, HoldingsSummary, HoldingCategory } from '$lib/types';

	// Investing boxes on the home carousel. The parent owns the summary data
	// and the server calls. Add and edit both open in a global modal, so the
	// carousel cards keep one fixed size and never resize around a form.
	// All fields use 16px inputs so iOS never auto-zooms on focus.
	type Props = {
		summary: HoldingsSummary | null;
		refreshing: boolean;
		onCreate: (h: { ticker: string; amount: number; avgPrice: number | null; currency: string; category: HoldingCategory; bank: string; country: string }) => Promise<boolean>;
		onUpdate: (id: string, patch: { ticker: string; avgPrice: number | null; currency: string; category: HoldingCategory; bank: string; country: string }) => Promise<boolean>;
		onDelete: (h: Holding) => void;
		onLoadActions: (id: string) => Promise<HoldingAction[] | null>;
		onRecordAction: (id: string, kind: 'buy' | 'sell', amount: number) => Promise<{ ok: boolean; error?: string; actions?: HoldingAction[] }>;
		onRefresh: () => void;
		onGoals: (
			pct: { btc: number; fii: number; cash: number },
			values: { btc: number | null; fii: number | null; cash: number | null }
		) => Promise<boolean>;
	};
	let { summary, refreshing, onCreate, onUpdate, onDelete, onLoadActions, onRecordAction, onRefresh, onGoals }: Props = $props();

	let modal: { mode: 'add'; initial: HoldingDraft } | { mode: 'edit'; holding: Holding } | null = $state(null);
	let acting = $state<Holding | null>(null);
	let goalsOpen = $state(false);
	let allocating = $state(false);

	const COLLAPSED_KEY = 'ferm:holdings-collapsed';
	let collapsed = $state(false);

	$effect(() => {
		try {
			collapsed = localStorage.getItem(COLLAPSED_KEY) === '1';
		} catch {
			// Private mode: the carousel simply starts expanded.
		}
	});

	function toggleCollapsed() {
		collapsed = !collapsed;
		try {
			localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0');
		} catch {
			// The toggle still works for the session.
		}
	}

	const btc = $derived(summary?.holdings.find((h) => h.ticker === 'BTC'));
	// Cash is the money we can spend, so it sits next to the totals card and
	// ignores the value sort. Each group keeps the API order.
	const cashHoldings = $derived(summary?.holdings.filter((h) => h.category === 'cash') ?? []);
	const otherHoldings = $derived(summary?.holdings.filter((h) => h.category !== 'cash') ?? []);

	function openAdd(preset?: Partial<HoldingDraft>) {
		modal = { mode: 'add', initial: { ...blankHoldingDraft(), ...preset } };
	}

	function openEdit(h: Holding) {
		modal = { mode: 'edit', holding: h };
	}

	function openActions(h: Holding) {
		modal = null;
		acting = h;
	}

	function toDraft(h: Holding): HoldingDraft {
		return {
			ticker: h.ticker,
			amount: String(h.amount),
			avgPrice: h.avgPrice === null ? '' : String(h.avgPrice),
			currency: h.currency,
			category: h.category,
			bank: h.bank,
			country: h.country
		};
	}

	async function submitAdd(parsed: {
		ticker: string;
		amount: number;
		avgPrice: number | null;
		currency: string;
		category: HoldingCategory;
		bank: string;
		country: string;
	}): Promise<boolean> {
		const ok = await onCreate(parsed);
		if (ok) modal = null;
		return ok;
	}

	async function submitEdit(
		id: string,
		parsed: {
			ticker: string;
			amount: number;
			avgPrice: number | null;
			currency: string;
			category: HoldingCategory;
			bank: string;
			country: string;
		}
	): Promise<boolean> {
		const ok = await onUpdate(id, {
			ticker: parsed.ticker,
			avgPrice: parsed.avgPrice,
			currency: parsed.currency,
			category: parsed.category,
			bank: parsed.bank,
			country: parsed.country
		});
		if (ok) modal = null;
		return ok;
	}

	function fmtMoney(v: number, ccy: string): string {
		try {
			return new Intl.NumberFormat('en-US', { style: 'currency', currency: ccy, maximumFractionDigits: 2 }).format(v);
		} catch {
			return `${ccy} ${v.toFixed(2)}`;
		}
	}

	function fmtUsdWhole(v: number): string {
		try {
			return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Math.round(v));
		} catch {
			return `$${Math.round(v).toLocaleString('en-US')}`;
		}
	}

	function fmtAmount(v: number): string {
		if (!Number.isFinite(v)) return '0';
		if (v >= 1000) return v.toLocaleString('en-US', { maximumFractionDigits: 2 });
		const s = v.toFixed(6).replace(/\.?0+$/, '');
		return s === '' ? '0' : s;
	}

	function fmtDate(at: number): string {
		return new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
	}

	function fmtBRL(v: number): string {
		try {
			return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(v);
		} catch {
			return `R$ ${Math.round(v).toLocaleString('en-US')}`;
		}
	}

	function fmtUYU(v: number): string {
		try {
			return new Intl.NumberFormat('es-UY', { style: 'currency', currency: 'UYU', maximumFractionDigits: 0 }).format(v);
		} catch {
			return `$U ${Math.round(v).toLocaleString('en-US')}`;
		}
	}

	function totalSizeClass(): string {
		const digits = String(Math.trunc(Math.abs(summary?.totalUsd ?? 0))).length;
		if (digits > 7) return 'text-lg';
		if (digits > 5) return 'text-xl';
		return 'text-2xl';
	}

</script>

{#if summary}
	{#snippet holdingCard(h: Holding)}
		<div role="listitem" class="flex w-40 shrink-0 snap-start">
			<div class="relative flex flex-1 flex-col overflow-hidden rounded-2xl border p-3 {h.category === 'cash' ? 'border-emerald-200/80 bg-emerald-50/80 dark:border-emerald-900/70 dark:bg-emerald-950/40' : 'border-stone-200/80 dark:border-stone-800/80 bg-white/70 dark:bg-stone-900/70'}">
				<button
					type="button"
					class="flex w-full flex-1 flex-col items-stretch text-left"
					aria-label="Edit {h.ticker}"
					onclick={() => openEdit(h)}
				>
					<p class="flex items-center gap-1 pr-6 text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
						<span class="truncate">{h.category === 'cash' ? h.bank || h.ticker : h.ticker}{h.category === 'cash' && h.country ? ` · ${h.country}` : ''}</span>
						{#if summary.goals !== null}
							{@const diff = Math.abs(summary.actual[h.category] - summary.goals[h.category])}
							<span
								class="h-1.5 w-1.5 shrink-0 rounded-full {diff <= 2 ? 'bg-emerald-500' : diff <= 5 ? 'bg-amber-400' : 'bg-rose-500'}"
								title="{h.category.toUpperCase()} {summary.actual[h.category].toFixed(1)}% · goal {summary.goals[h.category]}%"
							></span>
						{/if}
					</p>
					<p class="mt-1 truncate text-xl font-semibold tabular-nums text-stone-800 dark:text-stone-200">
						{h.price === null ? '—' : fmtMoney(h.amount * h.price, h.currency)}
					</p>
					<p class="truncate text-sm tabular-nums text-stone-600 dark:text-stone-300">
						{#if h.category !== 'cash'}{fmtAmount(h.amount)} {h.category === 'btc' ? 'BTC' : 'shares'}{:else}&nbsp;{/if}
					</p>
					<p class="truncate text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
						{#if h.price !== null && h.currency !== 'USD'}
							≈ {fmtMoney(h.valueUsd ?? 0, 'USD')}
						{:else if h.price !== null && summary.totalUsd > 0 && summary.displayTotals.BRL !== null}
							≈ {fmtBRL((h.valueUsd ?? 0) * (summary.displayTotals.BRL / summary.totalUsd))}
						{:else}
							&nbsp;
						{/if}
					</p>
					{#if summary.totalUsd > 0}
						<p class="truncate text-[11px] tabular-nums text-stone-400 dark:text-stone-500">{(((h.valueUsd ?? 0) / summary.totalUsd) * 100).toFixed(1)}% of total</p>
					{/if}
				</button>
				<button
					type="button"
					class="absolute right-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full text-stone-300 opacity-70 transition hover:bg-stone-100 hover:text-stone-600 hover:opacity-100 dark:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-300"
					aria-label="Record buy or sell for {h.ticker}"
					title="Buy / sell"
					onclick={() => openActions(h)}
				><Plus class="h-3.5 w-3.5" /></button>
				<div class="mt-1 flex justify-end">
					<button
						type="button"
						class="text-[11px] font-medium text-stone-400 dark:text-stone-500 hover:text-rose-600 dark:hover:text-rose-400"
						aria-label="Delete {h.ticker}"
						onclick={() => onDelete(h)}
					>Delete</button>
				</div>
			</div>
		</div>
	{/snippet}

	<div class="mb-1 flex items-center gap-1">
		<button
			type="button"
			class="flex min-w-0 items-center gap-1 rounded-full pr-2 text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300"
			aria-expanded={!collapsed}
			aria-label={collapsed ? 'Expand holdings' : 'Collapse holdings'}
			onclick={toggleCollapsed}
		>
			<span class="grid h-6 w-6 shrink-0 place-items-center">
				<ChevronDown class="h-4 w-4 transition-transform duration-200 motion-reduce:transition-none {collapsed ? '-rotate-90' : ''}" />
			</span>
			<span class="text-xs font-medium uppercase tracking-widest">Holdings</span>
			{#if collapsed}
				<span class="truncate text-[11px] tabular-nums">
					<span class="font-bold">{fmtUsdWhole(summary.totalUsd)}</span>
					{#if summary.displayTotals.BRL !== null} · {fmtBRL(summary.displayTotals.BRL)}{/if}
					{#if summary.displayTotals.UYU !== null} · {fmtUYU(summary.displayTotals.UYU)}{/if}
				</span>
			{/if}
		</button>
	</div>
	{#if !collapsed}
		<div
			class="flex snap-x items-stretch gap-2 overflow-x-auto no-scrollbar pb-1"
			role="list"
			aria-label="Holdings"
			transition:slide={{ duration: motionMs(180) }}
		>
			<div
				role="listitem"
				class="flex w-40 shrink-0 snap-start flex-col rounded-2xl bg-stone-950 text-stone-50 dark:border dark:border-stone-700 p-3"
			>
				<button
					type="button"
					class="block w-full text-left"
					aria-label="Edit goals"
					onclick={() => (goalsOpen = true)}
				>
					<p class="text-[11px] font-bold uppercase tracking-wider text-stone-400">Total USD</p>
					<p class="mt-1 font-bold tabular-nums break-all leading-tight {totalSizeClass()}">{fmtUsdWhole(summary.totalUsd)}</p>
					{#if summary.displayTotals.BRL !== null}
						<p class="mt-0.5 truncate text-[11px] tabular-nums text-stone-400">{fmtBRL(summary.displayTotals.BRL)}</p>
					{/if}
					{#if summary.displayTotals.UYU !== null}
						<p class="truncate text-[11px] tabular-nums text-stone-400">{fmtUYU(summary.displayTotals.UYU)}</p>
					{/if}
				</button>
				<div class="mt-auto flex items-center gap-1.5 pt-1">
					{#if summary.asOf}
						<span class="text-[11px] tabular-nums text-stone-400">
							{fmtDate(summary.asOf)}{#if summary.stale} · stale{/if}
						</span>
					{:else if summary.stale}
						<span class="text-[11px] text-stone-400">no rates</span>
					{:else}
						<span class="text-[11px] text-stone-400">cash basis</span>
					{/if}
					<button
						type="button"
						class="grid h-6 w-6 place-items-center rounded-full text-stone-400 hover:bg-white/10 hover:text-stone-200 disabled:opacity-50"
						aria-label="Refresh prices"
						title="Refresh prices"
						disabled={refreshing}
						onclick={onRefresh}
					><RefreshCw class="h-3.5 w-3.5 {refreshing ? 'animate-spin' : ''}" /></button>
					<button
						type="button"
						class="rounded-full px-2 py-1 text-[11px] font-medium text-stone-400 hover:bg-white/10 hover:text-stone-200"
						aria-label="Holding stats"
						title="Holding stats"
						onclick={() => (allocating = true)}
					>Stats</button>
				</div>
			</div>

			{#each cashHoldings as h (h.id)}
				{@render holdingCard(h)}
			{/each}

			{#if !btc}
				<div role="listitem" class="flex w-40 shrink-0 snap-start">
					<button
						type="button"
						class="flex w-full flex-col rounded-2xl border border-stone-200/80 dark:border-stone-800/80 bg-white/70 dark:bg-stone-900/70 p-3 text-left"
						aria-label="Set BTC amount"
						onclick={() => openAdd({ ticker: 'BTC', currency: 'USD', category: 'btc' })}
					>
						<p class="text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">₿ BTC</p>
						<p class="mt-1 truncate text-xl font-semibold tabular-nums text-stone-400 dark:text-stone-500">—</p>
						<p class="truncate text-sm text-stone-400 dark:text-stone-500">tap to set amount</p>
					</button>
				</div>
			{/if}

			{#each otherHoldings as h (h.id)}
				{@render holdingCard(h)}
			{/each}

			<div role="listitem" class="flex w-40 shrink-0 snap-start">
				<button
					type="button"
					class="grid w-full place-items-center rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300"
					aria-label="Add holding"
					onclick={() => openAdd()}
				><Plus class="h-6 w-6" /></button>
			</div>
		</div>
	{/if}
{/if}

{#if modal?.mode === 'add'}
	<HoldingModal
		title="Add holding"
		submitLabel="Add"
		mode="add"
		initial={modal.initial}
		onSubmit={submitAdd}
		onClose={() => (modal = null)}
	/>
{:else if modal?.mode === 'edit'}
	{@const h = modal.holding}
	<HoldingModal
		title="Edit {h.ticker}"
		submitLabel="Save"
		mode="edit"
		initial={toDraft(h)}
		updatedAt={h.price_updated_at}
		onSubmit={(parsed) => submitEdit(h.id, parsed)}
		onClose={() => (modal = null)}
	/>
{/if}
{#if acting}
	<HoldingActionsModal
		holding={acting}
		onLoad={onLoadActions}
		onRecord={onRecordAction}
		onClose={() => (acting = null)}
	/>
{/if}
{#if allocating && summary}
	<AllocationModal summary={summary} onClose={() => (allocating = false)} />
{/if}
{#if goalsOpen && summary}
	<GoalsModal summary={summary} onSave={onGoals} onClose={() => (goalsOpen = false)} />
{/if}
