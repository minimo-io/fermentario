<script lang="ts">
	import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
	import ArrowDownRight from '@lucide/svelte/icons/arrow-down-right';
	import { showToast } from '$lib/toast.svelte';
	import type { TradeHistoryCursor, TradeHistoryItem, TradeHistoryPage } from '$lib/types';

	type Props = { initial: TradeHistoryPage; lang?: string };
	let { initial, lang = 'en' }: Props = $props();

	type TradeMonth = { key: string; label: string; items: TradeHistoryItem[] };

	// The route load seeds the first page. This component owns the rest of
	// the cursor and keeps the list mounted while the page scrolls.
	// svelte-ignore state_referenced_locally
	const seed = initial;
	let items = $state<TradeHistoryItem[]>(seed.items);
	let count = $state(seed.count);
	let hasMore = $state(seed.hasMore);
	let cursor = $state<TradeHistoryCursor | null>(seed.nextCursor);
	let loadingMore = $state(false);
	let failed = $state(false);
	let sentinel = $state<HTMLDivElement | null>(null);

	const locale = $derived(lang === 'es' ? 'es-ES' : lang === 'pt' ? 'pt-PT' : 'en-US');

	function monthKey(at: number): string {
		const d = new Date(at);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
	}

	function monthLabel(at: number): string {
		return new Date(at).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
	}

	const months = $derived.by((): TradeMonth[] => {
		const groups: TradeMonth[] = [];
		for (const item of items) {
			const key = monthKey(item.created_at);
			let group = groups[groups.length - 1];
			if (!group || group.key !== key) {
				group = { key, label: monthLabel(item.created_at), items: [] };
				groups.push(group);
			}
			group.items.push(item);
		}
		return groups;
	});

	function fmt(at: number): string {
		if (!at) return '';
		return new Date(at).toLocaleString(locale, {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function fmtMoney(v: number, ccy: string): string {
		try {
			return new Intl.NumberFormat('en-US', {
				style: 'currency',
				currency: ccy,
				maximumFractionDigits: 2
			}).format(v);
		} catch {
			return `${v.toFixed(2)} ${ccy}`;
		}
	}

	function fmtAmount(v: number): string {
		const rounded = Math.round(v * 1e8) / 1e8;
		return new Intl.NumberFormat('en-US', { maximumFractionDigits: 8 }).format(rounded);
	}

	function title(t: TradeHistoryItem): string {
		const name = t.category === 'cash' ? t.bank || t.ticker : t.ticker;
		if (t.category === 'cash') return t.kind === 'buy' ? `Deposit ${name}` : `Withdrawal ${name}`;
		return t.kind === 'buy' ? `Buy ${name}` : `Sell ${name}`;
	}

	function tone(t: TradeHistoryItem): string {
		return t.kind === 'buy' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400';
	}

	async function loadMore() {
		if (loadingMore || !hasMore || !cursor || failed) return;
		loadingMore = true;
		try {
			const q = new URLSearchParams({
				limit: '50',
				before: String(cursor.created_at),
				before_id: cursor.id
			});
			const res = await fetch(`/api/holdings/actions?${q.toString()}`);
			if (!res.ok) throw new Error('Failed to load trades.');
			const d = (await res.json()) as TradeHistoryPage;
			items = [...items, ...d.items];
			count = d.count;
			cursor = d.nextCursor;
			hasMore = d.hasMore;
		} catch {
			failed = true;
			showToast('Failed to load more trades.');
		} finally {
			loadingMore = false;
		}
	}

	// Re-create the observer after each page. If the sentinel is still in view,
	// the new observer fires at once and the next page loads; a one-shot
	// observer would stop after the first short list.
	$effect(() => {
		const el = sentinel;
		if (!el || !hasMore || loadingMore || failed) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) void loadMore();
			},
			{ rootMargin: '600px 0px' }
		);
		observer.observe(el);
		return () => observer.disconnect();
	});
</script>

<section class="mt-8" aria-labelledby="trade-history-heading">
	<div class="mb-3 flex items-baseline justify-between gap-2">
		<h2 id="trade-history-heading" class="text-xs font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500">Trade history</h2>
		<span class="text-[11px] tabular-nums text-stone-400 dark:text-stone-500">{count} {count === 1 ? 'trade' : 'trades'}</span>
	</div>

	{#if items.length === 0}
		<p class="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 px-4 py-8 text-center text-sm text-stone-500 dark:text-stone-400">
			No trades yet.
		</p>
	{:else}
		{#each months as month (month.key)}
			<section class="mt-5 first:mt-0" aria-labelledby={`trade-month-${month.key}`}>
				<h3 id={`trade-month-${month.key}`} class="mb-2 text-xs font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500">
					{month.label}
				</h3>
				<ul class="space-y-2">
					{#each month.items as t (t.id)}
						<li class="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-4 py-2.5">
							<div class="flex items-start gap-2.5">
								<span
									class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full {t.kind === 'buy'
										? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400'
										: 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'}"
								>
									{#if t.kind === 'buy'}
										<ArrowUpRight class="h-3 w-3" />
									{:else}
										<ArrowDownRight class="h-3 w-3" />
									{/if}
								</span>
								<div class="min-w-0 flex-1">
									<p class="truncate text-[15px] leading-snug text-stone-800 dark:text-stone-200">{title(t)}</p>
									<p class="mt-1 text-[11px] tabular-nums text-stone-400 dark:text-stone-500">{fmt(t.created_at)}</p>
								</div>
								<div class="shrink-0 text-right">
									{#if t.category === 'cash'}
										<p class="text-[13px] font-medium tabular-nums {tone(t)}">
											{t.kind === 'buy' ? '+' : '−'}{fmtMoney(t.amount * (t.price ?? 1), t.currency)}
										</p>
									{:else}
										<p class="text-[13px] font-medium tabular-nums {tone(t)}">
											{t.kind === 'buy' ? '+' : '−'}{fmtAmount(t.amount)} {t.category === 'btc' ? 'BTC' : 'shares'}
										</p>
										{#if t.price !== null}
											<p class="text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
												{fmtMoney(t.amount * t.price, t.currency)}
											</p>
										{/if}
									{/if}
								</div>
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/each}

		{#if hasMore}
			<div bind:this={sentinel} class="h-1" aria-hidden="true"></div>
		{/if}
		{#if loadingMore}
			<p class="py-3 text-center text-[11px] text-stone-400 dark:text-stone-500" role="status">Loading more…</p>
		{:else if failed}
			<button
				type="button"
				class="mx-auto mt-3 block rounded-full border border-stone-200 dark:border-stone-800 px-4 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
				onclick={() => (failed = false)}
			>Retry</button>
		{/if}
	{/if}
</section>
