<script lang="ts">
	import { onMount } from 'svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import Package from '@lucide/svelte/icons/package';
	import FixedBottomBar from '$lib/components/FixedBottomBar.svelte';
	import Kbd from '$lib/components/Kbd.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import StockModal from '$lib/components/StockModal.svelte';
	import FieldHelp from '$lib/components/FieldHelp.svelte';
	import Info from '@lucide/svelte/icons/info';
	import { fmtCurrency } from '$lib/currency';
	import { dayLocale } from '$lib/dates';
	import { loading } from '$lib/loading.svelte';
	import type { StockItem, StockKind } from '$lib/types';

	type Props = { onError: (msg: string) => void; widthClass?: string; lang?: string };
	let { onError, widthClass = 'max-w-2xl', lang = 'en' }: Props = $props();

	// Add shortcut: desktop pointers only. ⌘⇧A on Mac, Ctrl+Shift+A
	// elsewhere — the same as tasks and principles.
	const isMac = navigator.userAgent.includes('Mac');
	const canKeyShortcut = matchMedia('(hover: hover) and (pointer: fine)').matches;
	const addShortcutKeys = isMac ? ['⌘', '⇧', 'A'] : ['Ctrl', 'Shift', 'A'];

	const TAB_KEY = 'ferm:stocks-tab';
	let tab = $state<StockKind>('consumable');
	let items = $state<StockItem[]>([]);
	let goalDays = $state(365);
	let goalDraft = $state('365');
	let goalTimer: ReturnType<typeof setTimeout> | undefined;
	let adding = $state(false);
	let editing = $state<StockItem | null>(null);
	let confirming = $state<StockItem | null>(null);
	let goalHelp = $state(false);

	const consumables = $derived(
		items
			.filter((x) => x.kind === 'consumable')
			.map((x) => ({ item: x, days: x.quantity * x.duration_days }))
			.sort((a, b) => {
				// Need-stock first: empty (no estimate) tops, then lowest
				// progress, then name. The goal divides both sides equally,
				// so remaining days order by progress directly.
				const ae = a.days <= 0 ? -1 : a.days;
				const be = b.days <= 0 ? -1 : b.days;
				return ae - be || a.item.name.localeCompare(b.item.name);
			})
	);
	const durables = $derived(items.filter((x) => x.kind === 'durable'));
	const visibleCount = $derived(tab === 'consumable' ? consumables.length : durables.length);

	const DAY_MS = 24 * 60 * 60 * 1000;

	function endDate(days: number): string {
		return new Date(Date.now() + days * DAY_MS).toLocaleDateString(dayLocale(lang), {
			day: 'numeric',
			month: 'short'
		});
	}

	function fmtDay(at: number | null): string {
		if (at === null) return '';
		return new Date(at).toLocaleDateString(dayLocale(lang), { day: 'numeric', month: 'short', year: 'numeric' });
	}

	function photoUrl(item: StockItem): string {
		return `/api/stocks/items/${item.id}/photo?v=${item.updated_at}`;
	}

	async function load() {
		try {
			const d = await (await loading.track(fetch('/api/stocks/items'))).json();
			items = Array.isArray(d.items) ? d.items : [];
		} catch {
			onError('Failed to load stock items.');
		}
		try {
			const g = await (await fetch('/api/stocks/goals')).json();
			const t = Math.trunc(Number(g?.target_days));
			if (Number.isFinite(t) && t >= 1) {
				goalDays = Math.min(t, 3650);
				goalDraft = String(goalDays);
			}
		} catch {
			// The goal keeps its one-year default.
		}
	}

	function queueGoalSave(raw: string) {
		goalDraft = raw;
		clearTimeout(goalTimer);
		goalTimer = setTimeout(() => void saveGoal(raw), 500);
	}

	async function saveGoal(raw: string) {
		const t = Math.trunc(Number(raw));
		if (!Number.isFinite(t) || t < 1 || t > 3650) {
			goalDraft = String(goalDays);
			return;
		}
		try {
			const res = await loading.track(fetch('/api/stocks/goals', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ target_days: t })
			}));
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to save the stock goal.');
			goalDays = d.target_days;
			goalDraft = String(goalDays);
		} catch (e) {
			goalDraft = String(goalDays);
			onError((e as Error)?.message ?? 'Failed to save the stock goal.');
		}
	}

	async function saveNew(body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
		try {
			const res = await loading.track(fetch('/api/stocks/items', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ kind: tab, ...body })
			}));
			const d = await res.json();
			if (!res.ok) return { ok: false, error: d?.error ?? 'Failed to add item.' };
			adding = false;
			items = [...items, d.item];
			return { ok: true };
		} catch (e) {
			return { ok: false, error: (e as Error)?.message ?? 'Failed to add item.' };
		}
	}

	async function saveEdit(item: StockItem, body: Record<string, unknown>): Promise<{ ok: boolean; error?: string }> {
		try {
			const res = await loading.track(fetch(`/api/stocks/items/${item.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			}));
			const d = await res.json();
			if (!res.ok) return { ok: false, error: d?.error ?? 'Failed to save item.' };
			editing = null;
			items = items.map((x) => (x.id === item.id ? d.item : x));
			return { ok: true };
		} catch (e) {
			return { ok: false, error: (e as Error)?.message ?? 'Failed to save item.' };
		}
	}

	async function remove(item: StockItem) {
		try {
			const res = await loading.track(fetch(`/api/stocks/items/${item.id}`, { method: 'DELETE' }));
			if (!res.ok) throw new Error('Failed to delete item.');
			confirming = null;
			items = items.filter((x) => x.id !== item.id);
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to delete item.');
		}
	}

	function handleAddShortcut(e: KeyboardEvent) {
		if (!canKeyShortcut) return;
		if (adding || editing || confirming) return;
		const t = e.target as HTMLElement | null;
		if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
		if (e.isComposing) return;
		if (e.key.toLowerCase() !== 'a' || !e.shiftKey) return;
		if (isMac ? !e.metaKey || e.altKey : !e.ctrlKey || e.altKey) return;
		e.preventDefault();
		adding = true;
	}

	onMount(() => {
		try {
			const raw = localStorage.getItem(TAB_KEY);
			if (raw === 'durable' || raw === 'consumable') tab = raw;
		} catch {}
	});

	$effect(() => {
		void load();
	});
</script>

<svelte:window onkeydown={handleAddShortcut} />

<div class="mb-3 flex flex-wrap items-center gap-2">
	<div class="flex flex-wrap gap-2" role="tablist" aria-label="Stock kinds">
		<button
			type="button"
			role="tab"
			aria-selected={tab === 'consumable'}
			class="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium {tab === 'consumable' ? 'bg-stone-900 dark:bg-stone-700 text-white' : 'text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'}"
			onclick={() => { tab = 'consumable'; try { localStorage.setItem(TAB_KEY, tab); } catch {} }}
		>Consumables ({consumables.length})</button>
		<button
			type="button"
			role="tab"
			aria-selected={tab === 'durable'}
			class="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium {tab === 'durable' ? 'bg-stone-900 dark:bg-stone-700 text-white' : 'text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'}"
			onclick={() => { tab = 'durable'; try { localStorage.setItem(TAB_KEY, tab); } catch {} }}
		>Durables ({durables.length})</button>
	</div>
	{#if tab === 'consumable'}
		<div class="flex w-full items-center justify-between gap-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2 sm:ml-auto sm:w-auto sm:border-0 sm:bg-transparent sm:px-0 sm:py-0 dark:sm:bg-transparent">
			<span class="flex items-center gap-1.5 text-xs font-medium text-stone-500 dark:text-stone-400">
				Stock goal
				<button
					type="button"
					class="grid h-4 w-4 place-items-center rounded-full text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300"
					aria-label="How the stock goal works"
					title="How the stock goal works"
					onclick={() => (goalHelp = true)}
				><Info class="h-3.5 w-3.5" /></button>
			</span>
			<span class="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
				<input
					type="number"
					class="w-20 rounded-full border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-2.5 py-1 text-center text-base tabular-nums text-stone-800 dark:text-stone-200 outline-none focus:border-stone-400 dark:focus:border-stone-600"
					aria-label="Stock goal in days for one person"
					value={goalDraft}
					min="1"
					max="3650"
					inputmode="numeric"
					oninput={(e) => queueGoalSave(e.currentTarget.value)}
					onblur={() => (goalDraft = String(goalDays))}
				/>
				days
			</span>
		</div>
	{/if}
</div>

{#if goalHelp}
	<FieldHelp
		title="Stock goal"
		body={[
			'How many days of stock you want to keep for one person.',
			'Each consumable compares its estimate with this goal. A red bar means you need more; it also tells you how many packages to add. 365 days is one year.'
		]}
		onClose={() => (goalHelp = false)}
	/>
{/if}

<div>
	{#if visibleCount === 0}
		<p class="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 px-4 py-8 text-center text-sm text-stone-500 dark:text-stone-400">
			{tab === 'consumable' ? 'No consumables yet — add the first one below.' : 'No durables yet — add the first one below.'}
		</p>
	{:else if tab === 'consumable'}
		<ul class="space-y-2">
			{#each consumables as row (row.item.id)}
				{@const item = row.item}
				{@const left = row.days > 0 ? row.days : null}
				{@const pct = left === null ? 0 : Math.min(100, (left / goalDays) * 100)}
				{@const met = left !== null && left >= goalDays}
				{@const need = left === null ? null : Math.max(0, Math.ceil((goalDays - left) / (item.duration_days || 1)))}
				<li class="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-4 py-2.5">
					<div class="flex items-start gap-3">
						{#if item.hasPhoto}
							<img src={photoUrl(item)} alt="" loading="lazy" class="h-14 w-14 shrink-0 rounded-xl object-cover" />
						{:else}
							<span class="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-300 dark:text-stone-600">
								<Package class="h-6 w-6" aria-hidden="true" />
							</span>
						{/if}
						<button
							type="button"
							class="min-w-0 flex-1 text-left"
							onclick={() => (editing = item)}
						>
							<p class="truncate text-[15px] font-medium text-stone-800 dark:text-stone-200">{item.name}</p>
							{#if item.brand || item.category}
								<p class="mt-0.5 truncate text-[11px] text-stone-400 dark:text-stone-500">{item.brand}{#if item.brand && item.category} · {/if}{item.category}</p>
							{/if}
							<p class="mt-0.5 truncate text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
								{#if left === null}
									Empty — no estimate
								{:else}
									{item.quantity} {item.quantity === 1 ? 'package' : 'packages'} · ~{Math.ceil(left)} days left · until {endDate(left)}
								{/if}
							</p>
							<div
								class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800"
								role="progressbar"
								aria-label="Stock versus goal"
								aria-valuenow={Math.round(pct)}
								aria-valuemin={0}
								aria-valuemax={100}
							>
								<div class="h-full rounded-full {met ? 'bg-emerald-500' : 'bg-rose-500'}" style="width: {pct}%"></div>
							</div>
							<p class="mt-1 text-[11px] font-medium {met ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
								{#if met}
									Covered · ~{Math.ceil(left ?? 0)} of {goalDays} days
								{:else if left === null}
									Needs stock for {goalDays} days
								{:else}
									Needs ~{need} more {need === 1 ? 'package' : 'packages'} for {goalDays} days
								{/if}
							</p>
							{#if item.note}
								<p class="mt-0.5 line-clamp-2 whitespace-pre-wrap text-xs leading-snug text-stone-500 dark:text-stone-400">{item.note}</p>
							{/if}
						</button>
						<button
							type="button"
							class="shrink-0 text-[11px] font-medium text-stone-400 dark:text-stone-500 hover:text-rose-600 dark:hover:text-rose-400"
							aria-label="Delete {item.name}"
							onclick={() => (confirming = item)}
						>Delete</button>
					</div>
				</li>
			{/each}
		</ul>
	{:else}
		<ul class="space-y-2">
			{#each durables as item (item.id)}
				<li class="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-4 py-2.5">
					<div class="flex items-start gap-3">
						{#if item.hasPhoto}
							<img src={photoUrl(item)} alt="" loading="lazy" class="h-14 w-14 shrink-0 rounded-xl object-cover" />
						{:else}
							<span class="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-300 dark:text-stone-600">
								<Package class="h-6 w-6" aria-hidden="true" />
							</span>
						{/if}
						<button
							type="button"
							class="min-w-0 flex-1 text-left"
							onclick={() => (editing = item)}
						>
							<p class="truncate text-[15px] font-medium text-stone-800 dark:text-stone-200">{item.name}</p>
							{#if item.brand || item.category}
								<p class="mt-0.5 truncate text-[11px] text-stone-400 dark:text-stone-500">{item.brand}{#if item.brand && item.category} · {/if}{item.category}</p>
							{/if}
							<p class="mt-0.5 truncate text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
								{#if item.bought_at}{fmtDay(item.bought_at)}{/if}{#if item.bought_where} · {item.bought_where}{/if}{#if item.price !== null} · {fmtCurrency(item.price, item.currency || 'BRL', 2)}{/if}
							</p>
							<p class="mt-0.5 text-[11px] font-medium {item.ended_at === null ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-400 dark:text-stone-500'}">
								{item.ended_at === null ? 'Owned' : `Ended ${fmtDay(item.ended_at)}`}
							</p>
							{#if item.note}
								<p class="mt-0.5 line-clamp-2 whitespace-pre-wrap text-xs leading-snug text-stone-500 dark:text-stone-400">{item.note}</p>
							{/if}
						</button>
						<button
							type="button"
							class="shrink-0 text-[11px] font-medium text-stone-400 dark:text-stone-500 hover:text-rose-600 dark:hover:text-rose-400"
							aria-label="Delete {item.name}"
							onclick={() => (confirming = item)}
						>Delete</button>
					</div>
				</li>
			{/each}
		</ul>
	{/if}
</div>

<FixedBottomBar {widthClass}>
	<button
		type="button"
		class="flex min-h-11 w-full flex-1 items-center justify-center gap-1.5 rounded-full bg-stone-900 dark:bg-stone-700 px-4 py-2 text-sm font-medium whitespace-nowrap text-white"
		onclick={() => (adding = true)}
		aria-keyshortcuts={isMac ? 'Meta+Shift+A' : 'Control+Shift+A'}
	><Plus class="h-4 w-4" /> Add<Kbd keys={addShortcutKeys} tone="dark" /></button>
</FixedBottomBar>

{#if adding}
	<StockModal
		kind={tab}
		title={tab === 'consumable' ? 'Add consumable' : 'Add durable'}
		submitLabel="Add"
		initial={null}
		onSubmit={saveNew}
		onClose={() => (adding = false)}
	/>
{/if}

{#if editing !== null}
	{@const ep = items.find((x) => x.id === (editing as StockItem).id) ?? (editing as StockItem)}
	<StockModal
		kind={ep.kind}
		title="Edit {ep.name}"
		submitLabel="Save"
		initial={ep}
		onSubmit={(body) => saveEdit(ep, body)}
		onClose={() => (editing = null)}
	/>
{/if}

{#if confirming}
	{@const cp = confirming}
	<ConfirmDialog
		title="Delete this item?"
		message="{cp.name} will be permanently removed, along with its photo. This cannot be undone."
		confirmLabel="Delete item"
		cancelLabel="Cancel"
		confirmTone="danger"
		onConfirm={() => void remove(cp)}
		onCancel={() => (confirming = null)}
	/>
{/if}
