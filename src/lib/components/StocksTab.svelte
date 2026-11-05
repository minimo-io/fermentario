<script lang="ts">
	import { onMount } from 'svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import Package from '@lucide/svelte/icons/package';
	import FixedBottomBar from '$lib/components/FixedBottomBar.svelte';
	import Kbd from '$lib/components/Kbd.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import StockModal from '$lib/components/StockModal.svelte';
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
	let adding = $state(false);
	let editing = $state<StockItem | null>(null);
	let confirming = $state<StockItem | null>(null);

	const consumables = $derived(items.filter((x) => x.kind === 'consumable'));
	const durables = $derived(items.filter((x) => x.kind === 'durable'));
	const visible = $derived(tab === 'consumable' ? consumables : durables);

	const DAY_MS = 24 * 60 * 60 * 1000;

	/** Remaining stock in days, from today. Null when there is no estimate. */
	function daysLeft(c: StockItem): number | null {
		const total = c.quantity * c.duration_days;
		if (!Number.isFinite(total) || total <= 0) return null;
		return total;
	}

	function urgency(days: number | null): string {
		if (days === null) return 'bg-stone-300 dark:bg-stone-600';
		if (days <= 7) return 'bg-rose-500';
		if (days <= 30) return 'bg-amber-400';
		return 'bg-emerald-500';
	}

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

<div class="mb-4 flex flex-wrap gap-2" role="tablist" aria-label="Stock kinds">
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

<div>
	{#if visible.length === 0}
		<p class="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 px-4 py-8 text-center text-sm text-stone-500 dark:text-stone-400">
			{tab === 'consumable' ? 'No consumables yet — add the first one below.' : 'No durables yet — add the first one below.'}
		</p>
	{:else}
		<ul class="space-y-2">
			{#each visible as item (item.id)}
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
							{#if item.kind === 'consumable'}
								{@const left = daysLeft(item)}
								<p class="mt-0.5 flex items-center gap-1.5 truncate text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
									<span class="h-1.5 w-1.5 shrink-0 rounded-full {urgency(left)}"></span>
									{#if left === null}
										Empty — no estimate
									{:else}
										{item.quantity} {item.quantity === 1 ? 'package' : 'packages'} · ~{Math.ceil(left)} days left · until {endDate(left)}
									{/if}
								</p>
							{:else}
								<p class="mt-0.5 truncate text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
									{#if item.bought_at}{fmtDay(item.bought_at)}{/if}{#if item.bought_where} · {item.bought_where}{/if}{#if item.price !== null} · {fmtCurrency(item.price, item.currency || 'BRL', 2)}{/if}
								</p>
								<p class="mt-0.5 text-[11px] font-medium {item.ended_at === null ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-400 dark:text-stone-500'}">
									{item.ended_at === null ? 'Owned' : `Ended ${fmtDay(item.ended_at)}`}
								</p>
							{/if}
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
