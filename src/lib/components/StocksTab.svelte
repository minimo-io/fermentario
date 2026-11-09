<script lang="ts">
	import { onMount } from 'svelte';
	import { slide } from 'svelte/transition';
	import Plus from '@lucide/svelte/icons/plus';
	import Package from '@lucide/svelte/icons/package';
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import LayoutList from '@lucide/svelte/icons/layout-list';
	import Target from '@lucide/svelte/icons/target';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import FixedBottomBar from '$lib/components/FixedBottomBar.svelte';
	import Kbd from '$lib/components/Kbd.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import StockModal from '$lib/components/StockModal.svelte';
	import StockGoalsModal from '$lib/components/StockGoalsModal.svelte';
	import StockCategoryModal from '$lib/components/StockCategoryModal.svelte';
	import { fmtCurrency } from '$lib/currency';
	import {
		fmtQty,
		fmtStockDate,
		stockAgeParts,
		stockDisplayTitle,
		stockGoalAmount,
		stockPackageAmount,
		stockExpiry,
		stockExpiryDays,
		stockPhotoUrl,
		stockTotalSize,
		stockUnit,
		stockUnitFamily
	} from '$lib/stock';
	import StockViewModal from '$lib/components/StockViewModal.svelte';
	import StockConsumeModal from '$lib/components/StockConsumeModal.svelte';
	import { motionMs } from '$lib/motion';
	import { loading } from '$lib/loading.svelte';
	import type { StockAction, StockCategoryGoal, StockItem, StockKind } from '$lib/types';

	type Props = { onError: (msg: string) => void; widthClass?: string; lang?: string };
	let { onError, widthClass = 'max-w-2xl', lang = 'en' }: Props = $props();

	// Add shortcut: desktop pointers only. ⌘⇧A on Mac, Ctrl+Shift+A
	// elsewhere — the same as tasks and principles.
	const isMac = navigator.userAgent.includes('Mac');
	const canKeyShortcut = matchMedia('(hover: hover) and (pointer: fine)').matches;
	const addShortcutKeys = isMac ? ['⌘', '⇧', 'A'] : ['Ctrl', 'Shift', 'A'];

	const TAB_KEY = 'ferm:stocks-tab';
	const VIEW_KEY = 'ferm:stocks-view';
	const STATUS_KEY = 'ferm:stocks-status-collapsed';
	const GROUPS_KEY = 'ferm:stocks-groups-collapsed';
	let tab = $state<StockKind>('consumable');
	let view = $state<'detailed' | 'compact'>('detailed');
	let items = $state<StockItem[]>([]);
	let categoryGoals = $state<StockCategoryGoal[]>([]);
	let adding = $state(false);
	let editing = $state<StockItem | null>(null);
	let viewing = $state<StockItem | null>(null);
	let confirming = $state<StockItem | null>(null);
	let goalsOpen = $state(false);
	let statusCollapsed = $state(false);
	let collapsedGroupKeys = $state<string[]>([]);
	let categoryEditing = $state<ConsumableGroup | null>(null);
	let goalCategory = $state<string | null>(null);
	let consuming = $state(false);
	let statusFilter = $state('');
	let showCovered = $state(false);
	let showNoGoal = $state(false);
	let viewActions = $state<StockAction[]>([]);
	let actionsItemId = $state<string | null>(null);

	interface ConsumableGroup {
		key: string;
		category: string;
		/** Parent group label; empty sorts last as its own block. */
		group: string;
		rows: { item: StockItem }[];
		goal: StockCategoryGoal | null;
		have: number;
		target: number;
		pct: number;
		met: boolean;
		missing: number;
		noSize: number;
		mismatched: number;
		/** Count of items expired now vs expiring within 30 days. */
		expired: number;
		soon: number;
		/** Rough buy estimate: packages of the newest suitable item that
		 *  cover the missing amount, in that item's native unit. */
		estimate: { packages: number; name: string; size: number; unit: string } | null;
	}

	interface CategoryBlock {
		key: string;
		label: string;
		groups: ConsumableGroup[];
	}

	const consumableItems = $derived(items.filter((x) => x.kind === 'consumable'));

	// Groups answer "what to buy in this category": one progress header per
	// category with a goal, then categories without a goal. Groups with a goal
	// sort need-first (lowest percent, then most missing), the rest by name.
	// Items sort by name inside their group.
	const consumableGroups = $derived.by((): ConsumableGroup[] => {
		const groups = new Map<string, ConsumableGroup>();
		const keyFor = (category: string) => category || '';
		const displayFor = (category: string) => category || 'No category';
		for (const goal of categoryGoals) {
			groups.set(keyFor(goal.category), {
				key: keyFor(goal.category),
				category: displayFor(goal.category),
				group: goal.group,
				rows: [],
				goal,
				have: 0,
				target: goal.target,
				pct: 0,
				met: false,
				missing: goal.target,
				noSize: 0,
				mismatched: 0,
				expired: 0,
				soon: 0,
				estimate: null
			});
		}
		for (const item of consumableItems) {
			const key = keyFor(item.category);
			let group = groups.get(key);
			if (!group) {
				group = {
					key,
					category: displayFor(item.category),
					group: item.group,
					rows: [],
					goal: null,
					have: 0,
					target: 0,
					pct: 0,
					met: false,
					missing: 0,
					noSize: 0,
					mismatched: 0,
					expired: 0,
					soon: 0,
					estimate: null
				};
				groups.set(key, group);
			}
			group.rows.push({ item });
			const expiry = stockExpiry(item);
			if (expiry === 'expired') group.expired += 1;
			else if (expiry === 'soon') group.soon += 1;
			if (group.goal) {
				const added = stockGoalAmount(item, group.goal.unit);
				if (added === null) {
					// A sized item in the other family is a unit mismatch;
					// an unsized item is simply missing its size.
					if (item.package_size > 0) group.mismatched += 1;
					else group.noSize += 1;
				} else group.have += added;
			}
		}
		for (const group of groups.values()) {
			group.rows.sort((a, b) => {
				// Expiration first: expired items, then expiring soon, then
				// the rest by name.
				const rank = (it: StockItem) => {
					const e = stockExpiry(it);
					return e === 'expired' ? 0 : e === 'soon' ? 1 : 2;
				};
				return rank(a.item) - rank(b.item) || stockDisplayTitle(a.item).localeCompare(stockDisplayTitle(b.item));
			});
			if (group.goal) {
				group.missing = Math.max(0, group.target - group.have);
				group.met = group.have >= group.target;
				group.pct = group.target > 0 ? Math.min(100, (group.have / group.target) * 100) : 0;
				// The estimate uses the newest item that counts: its single
				// package size is the rough shopping unit.
				if (!group.met && group.missing > 0) {
					const candidates = group.rows
						.map((r) => r.item)
						.filter((i) => stockGoalAmount(i, group.goal!.unit) !== null)
						.sort((a, b) => b.created_at - a.created_at || b.updated_at - a.updated_at);
					const latest = candidates[0];
					const perPackage = latest ? stockPackageAmount(latest, group.goal.unit) : null;
					if (latest && perPackage !== null && perPackage > 0) {
						group.estimate = {
							packages: Math.ceil(group.missing / perPackage),
							name: stockDisplayTitle(latest),
							size: latest.package_size,
							unit: stockUnit(latest)
						};
					}
				}
			}
		}
		return [...groups.values()].sort((a, b) => {
			// Parent groups order the whole list; an empty group goes last.
			// Inside a group, goal rows sort need-first.
			if (a.group !== b.group) {
				if (!a.group) return 1;
				if (!b.group) return -1;
				const c = a.group.localeCompare(b.group);
				if (c !== 0) return c;
			}
			if (a.goal && b.goal) return a.pct - b.pct || b.missing - a.missing || a.category.localeCompare(b.category);
			if (a.goal) return -1;
			if (b.goal) return 1;
			return a.category.localeCompare(b.category);
		});
	});

	// Grouped view of the flat list: one block per parent group (plus the
	// ungrouped tail), categories in need-first order inside each block.
	const consumableBlocks = $derived.by((): CategoryBlock[] => {
		const blocks: CategoryBlock[] = [];
		for (const group of consumableGroups) {
			const key = group.group || '__none';
			let block = blocks.find((b) => b.key === key);
			if (!block) {
				block = { key, label: group.group || 'Ungrouped', groups: [] };
				blocks.push(block);
			}
			block.groups.push(group);
		}
		const query = statusFilter.trim().toLowerCase();
		if (!query) return blocks;
		return blocks
			.map((block) => ({
				...block,
				groups: block.groups.filter(
					(g) => g.category.toLowerCase().includes(query) || block.label.toLowerCase().includes(query)
				)
			}))
			.filter((block) => block.groups.length > 0);
	});

	const statusCounts = $derived({
		need: consumableGroups.filter((g) => g.goal !== null && !g.met).length,
		covered: consumableGroups.filter((g) => g.goal !== null && g.met).length,
		noGoal: consumableGroups.filter((g) => g.goal === null).length
	});
	const durables = $derived(items.filter((x) => x.kind === 'durable'));

	// Units used by the items of each category, for goal inference: the
	// goals modal defaults a new row to the family's base unit (`g` for
	// mass, `L` for volume) and shows a hint when the goal family differs.
	const categoryUnitInfo = $derived.by(() => {
		const units = new Map<string, { seen: Set<string>; families: Set<string> }>();
		for (const item of consumableItems) {
			if (!item.category) continue;
			let entry = units.get(item.category);
			if (!entry) {
				entry = { seen: new Set(), families: new Set() };
				units.set(item.category, entry);
			}
			entry.seen.add(stockUnit(item));
			const fam = stockUnitFamily(item.package_unit);
			if (fam) entry.families.add(fam);
		}
		const text: Record<string, string> = {};
		const families: Record<string, 'mass' | 'volume' | null> = {};
		const groups: Record<string, string> = {};
		for (const [category, entry] of units) {
			text[category] = [...entry.seen].sort().join(', ');
			families[category] = entry.families.size === 1 ? ([...entry.families][0] as 'mass' | 'volume') : null;
		}
		for (const g of categoryGoals) {
			if (g.group) groups[g.category] = g.group;
		}
		for (const item of consumableItems) {
			if (item.category && item.group) groups[item.category] = item.group;
		}
		return { text, families, groups };
	});

	async function load() {
		try {
			const d = await (await loading.track(fetch('/api/stocks/items'))).json();
			items = Array.isArray(d.items) ? d.items : [];
		} catch {
			onError('Failed to load stock items.');
		}
		try {
			const g = await (await fetch('/api/stocks/goals')).json();
			categoryGoals = Array.isArray(g?.goals) ? g.goals : [];
		} catch {
			categoryGoals = [];
		}
	}

	async function saveCategoryGoals(
		rows: { category: string; people: number; amount: number; unit: string; note: string }[]
	): Promise<{ ok: boolean; error?: string }> {
		try {
			const res = await loading.track(fetch('/api/stocks/goals', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ goals: rows })
			}));
			const d = await res.json();
			if (!res.ok) return { ok: false, error: d?.error ?? 'Failed to save the goals.' };
			categoryGoals = Array.isArray(d.goals) ? d.goals : [];
			return { ok: true };
		} catch (e) {
			return { ok: false, error: (e as Error)?.message ?? 'Failed to save the goals.' };
		}
	}

	function openView(item: StockItem) {
		viewing = item;
		consuming = false;
		if (item.kind === 'consumable') void loadActions(item);
	}

	function openGoals(category?: string) {
		goalCategory = category ?? null;
		goalsOpen = true;
	}

	async function loadActions(item: StockItem) {
		actionsItemId = item.id;
		viewActions = [];
		try {
			const d = await (await fetch(`/api/stocks/items/${item.id}/actions`)).json();
			if (actionsItemId === item.id && Array.isArray(d.actions)) viewActions = d.actions;
		} catch {
			// History is optional; the item view still works.
		}
	}

	async function consume(item: StockItem, body: { amount: number; unit: string; note: string }): Promise<{ ok: boolean; error?: string }> {
		try {
			const res = await loading.track(fetch(`/api/stocks/items/${item.id}/consume`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			}));
			const d = await res.json();
			if (!res.ok) return { ok: false, error: d?.error ?? 'Could not record the consumption.' };
			items = items.map((x) => (x.id === item.id ? d.item : x));
			if (d.action) viewActions = [d.action, ...viewActions];
			return { ok: true };
		} catch (e) {
			return { ok: false, error: (e as Error)?.message ?? 'Could not record the consumption.' };
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
		if (adding || editing || viewing || confirming) return;
		const t = e.target as HTMLElement | null;
		if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
		if (e.isComposing) return;
		if (e.key.toLowerCase() !== 'a' || !e.shiftKey) return;
		if (isMac ? !e.metaKey || e.altKey : !e.ctrlKey || e.altKey) return;
		e.preventDefault();
		adding = true;
	}

	function chooseView(next: 'detailed' | 'compact') {
		view = next;
		try {
			localStorage.setItem(VIEW_KEY, next);
		} catch {}
	}

	onMount(() => {
		try {
			const raw = localStorage.getItem(TAB_KEY);
			if (raw === 'durable' || raw === 'consumable') tab = raw;
			const saved = localStorage.getItem(VIEW_KEY);
			if (saved === 'detailed' || saved === 'compact') view = saved;
			statusCollapsed = localStorage.getItem(STATUS_KEY) === '1';
			const rawGroups = localStorage.getItem(GROUPS_KEY);
			if (rawGroups) {
				const parsed = JSON.parse(rawGroups);
				if (Array.isArray(parsed)) collapsedGroupKeys = parsed.filter((x) => typeof x === 'string');
			}
		} catch {}
	});

	function toggleStatus() {
		statusCollapsed = !statusCollapsed;
		try {
			localStorage.setItem(STATUS_KEY, statusCollapsed ? '1' : '0');
		} catch {}
	}

	function toggleGroup(key: string) {
		collapsedGroupKeys = collapsedGroupKeys.includes(key)
			? collapsedGroupKeys.filter((k) => k !== key)
			: [...collapsedGroupKeys, key];
		try {
			localStorage.setItem(GROUPS_KEY, JSON.stringify(collapsedGroupKeys));
		} catch {}
	}

	$effect(() => {
		void load();
	});
</script>

<svelte:window onkeydown={handleAddShortcut} />

<div class="mb-3 flex flex-wrap items-center justify-between gap-2">
	<div class="flex flex-wrap gap-2" role="tablist" aria-label="Stock kinds">
		<button
			type="button"
			role="tab"
			aria-selected={tab === 'consumable'}
			class="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium {tab === 'consumable' ? 'bg-stone-900 dark:bg-stone-700 text-white' : 'text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'}"
			onclick={() => { tab = 'consumable'; try { localStorage.setItem(TAB_KEY, tab); } catch {} }}
		>Consumables ({consumableItems.length})</button>
		<button
			type="button"
			role="tab"
			aria-selected={tab === 'durable'}
			class="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium {tab === 'durable' ? 'bg-stone-900 dark:bg-stone-700 text-white' : 'text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800'}"
			onclick={() => { tab = 'durable'; try { localStorage.setItem(TAB_KEY, tab); } catch {} }}
		>Durables ({durables.length})</button>
	</div>
	{#if tab === 'consumable'}
		<div class="order-3 flex w-full items-center gap-2 sm:order-2 sm:ml-auto sm:w-auto">
			<button
				type="button"
				class="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-stone-300 px-4 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100 sm:w-auto dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
				onclick={() => window.open('/api/stocks/print?scope=all', '_blank', 'noreferrer')}
			>Print</button>
			<button
				type="button"
				class="inline-flex w-full items-center justify-center gap-1.5 rounded-full border border-stone-300 px-4 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100 sm:w-auto dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
				onclick={() => window.open('/api/stocks/print?scope=shopping', '_blank', 'noreferrer')}
			>Shopping</button>
		</div>
	{/if}
	<div class="order-2 ml-auto inline-flex items-center gap-0.5 rounded-full border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-0.5 sm:order-3 {tab === 'durable' ? 'sm:ml-auto' : 'sm:ml-0'}">
		<button
			type="button"
			class="grid h-7 w-7 place-items-center rounded-full {view === 'detailed' ? 'bg-stone-900 dark:bg-stone-700 text-white' : 'text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800'}"
			aria-label="Detailed view"
			aria-pressed={view === 'detailed'}
			title="Detailed view"
			onclick={() => chooseView('detailed')}
		><LayoutGrid class="h-4 w-4" /></button>
		<button
			type="button"
			class="grid h-7 w-7 place-items-center rounded-full {view === 'compact' ? 'bg-stone-900 dark:bg-stone-700 text-white' : 'text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800'}"
			aria-label="Compact view"
			aria-pressed={view === 'compact'}
			title="Compact view"
			onclick={() => chooseView('compact')}
		><LayoutList class="h-4 w-4" /></button>
	</div>
</div>



<div>
	{#if tab === 'consumable'}
		{#if consumableGroups.length === 0}
			<div class="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 px-4 py-8 text-center">
				<p class="text-sm text-stone-500 dark:text-stone-400">No consumables yet — add the first one below.</p>
				<button
					type="button"
					class="mt-3 inline-flex items-center gap-1.5 rounded-full border border-stone-300 px-4 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
					onclick={() => openGoals()}
				><Target class="h-4 w-4" /> Set category goals</button>
			</div>
		{:else}
			<section class="mb-4 rounded-2xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/60 px-4 py-3" aria-label="Stock status by category">
				<div class="flex items-center justify-between gap-2">
					<button
						type="button"
						class="flex min-w-0 items-center gap-1.5 rounded-full pr-2 text-stone-500 hover:bg-stone-100 hover:text-stone-700 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-200"
						aria-expanded={!statusCollapsed}
						aria-label={statusCollapsed ? 'Expand stock status' : 'Collapse stock status'}
						onclick={toggleStatus}
					>
						<ChevronDown class="h-4 w-4 shrink-0 transition-transform duration-200 motion-reduce:transition-none {statusCollapsed ? '-rotate-90' : ''}" />
						<span class="text-[11px] font-medium tracking-wide uppercase">Stock status</span>
						{#if statusCollapsed}
							<span class="truncate text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
								{statusCounts.need} need · {statusCounts.covered} covered · {statusCounts.noGoal} no goal
							</span>
						{/if}
					</button>
				</div>
				{#if !statusCollapsed}
				<div transition:slide={{ duration: motionMs(180) }}>
				<input
					type="text"
					class="mt-2 w-full rounded-full border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-1 text-xs text-stone-800 dark:text-stone-200 outline-none placeholder:text-stone-400 focus:border-stone-400"
					placeholder="Filter categories"
					aria-label="Filter categories"
					value={statusFilter}
					oninput={(e) => (statusFilter = e.currentTarget.value)}
				/>
				<div class="mt-1">
					{#each consumableBlocks as block (block.key)}
						{@const groupCollapsed = collapsedGroupKeys.includes(block.key)}
						<button
							type="button"
							class="mt-2 flex w-full items-center gap-1.5 rounded-full py-1 text-left text-[11px] font-semibold tracking-wide text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300"
							aria-expanded={!groupCollapsed}
							aria-label={groupCollapsed ? `Expand ${block.label}` : `Collapse ${block.label}`}
							onclick={() => toggleGroup(block.key)}
						>
							<ChevronDown class="h-3.5 w-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none {groupCollapsed ? '-rotate-90' : ''}" />
							<span class="uppercase">{block.label} ({block.groups.length})</span>
						</button>
						{#if !groupCollapsed}
						<div transition:slide={{ duration: motionMs(180) }} class="divide-y divide-stone-200/70 dark:divide-stone-800/70">
							{#each block.groups as group (group.key)}
						{#if group.goal}
							{@const g = group.goal}
							{@const gu = g.unit}
							<div class="py-2.5">
								<div class="flex items-baseline justify-between gap-2">
									<h3 class="min-w-0 truncate text-sm font-semibold text-stone-900 dark:text-stone-100">{group.category}</h3>
									<span class="flex shrink-0 items-center gap-2">
										<span class="text-xs tabular-nums {group.met ? 'text-emerald-600 dark:text-emerald-400' : group.pct >= 60 ? 'text-amber-600 dark:text-amber-400' : 'text-rose-600 dark:text-rose-400'}">{Math.round(group.pct)}%</span>
										<span class="text-xs tabular-nums text-stone-600 dark:text-stone-300">{fmtQty(group.have, gu)} / {fmtQty(group.target, gu)}</span>
										<button
											type="button"
											class="text-[11px] font-medium text-stone-500 hover:underline dark:text-stone-400"
											aria-label="Edit {group.category}"
											onclick={() => (categoryEditing = group)}
										>Edit</button>
									</span>
								</div>
								<div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800" role="progressbar" aria-label="{group.category} stock versus goal" aria-valuenow={Math.round(group.pct)} aria-valuemin={0} aria-valuemax={100}>
									<div class="h-full rounded-full {group.met ? 'bg-emerald-500' : group.pct >= 60 ? 'bg-amber-400' : 'bg-rose-500'}" style="width: {group.pct}%"></div>
								</div>
								<p class="mt-1 text-[11px] font-medium leading-snug {group.met ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}">
									{#if group.met}
										Covered
									{:else}
										Need {fmtQty(group.missing, gu)} more
									{/if}
								</p>
								{#if group.estimate}
									<p class="mt-0.5 text-[11px] leading-snug text-stone-500 dark:text-stone-400">
										≈ {group.estimate.packages} × {fmtQty(group.estimate.size, group.estimate.unit)} of {group.estimate.name}
									</p>
								{/if}
								<p class="mt-0.5 text-[11px] leading-snug text-stone-500 dark:text-stone-400">
									{g.people} {g.people === 1 ? 'person' : 'people'}{#if g.note} · {g.note}{/if}
								</p>
								{#if group.expired > 0 || group.soon > 0}
									<p class="mt-0.5 text-[11px] font-medium leading-snug {group.expired > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}">
										{#if group.expired > 0}
											{group.expired} {group.expired === 1 ? 'item expired' : 'items expired'}
										{/if}
										{#if group.expired > 0 && group.soon > 0} · {/if}
										{#if group.soon > 0}
											{group.soon} {group.soon === 1 ? 'item expires' : 'items expire'} within 30 days
										{/if}
									</p>
								{/if}
								{#if group.mismatched > 0 || group.noSize > 0}
									<p class="mt-0.5 text-[11px] leading-snug text-stone-500 dark:text-stone-400">
										{#if group.mismatched > 0}
											{@const mu = [...new Set(
												group.rows
													.filter((r) => r.item.package_size > 0 && stockGoalAmount(r.item, gu) === null)
													.map((r) => stockUnit(r.item))
											)].join(', ')}
											{group.mismatched} {group.mismatched === 1 ? 'item uses' : 'items use'} {mu}, but this goal is in {gu}. Edit the goal unit to match them.
										{/if}
										{#if group.noSize > 0}
											{group.noSize} {group.noSize === 1 ? 'item does' : 'items do'} not count — set a package size in {stockUnitFamily(gu) === 'volume' ? 'ml or L' : 'g or kg'}.
										{/if}
									</p>
								{/if}
							</div>
						{:else}
							<div class="flex items-center justify-between gap-2 py-2.5">
								<h3 class="min-w-0 truncate text-sm font-semibold text-stone-900 dark:text-stone-100">{group.category}</h3>
								<span class="flex shrink-0 items-center gap-2">
									<span class="text-xs text-stone-400 dark:text-stone-500">No goal</span>
									<button
										type="button"
										class="text-[11px] font-medium text-stone-500 hover:underline dark:text-stone-400"
										aria-label="Edit {group.category}"
										onclick={() => (categoryEditing = group)}
									>Edit</button>
								</span>
							</div>
						{/if}
					{/each}
				</div>
				{/if}
			{/each}
			</div>
			</div>
			{/if}
		</section>
			{#each consumableBlocks as block (block.key)}
				{@const groupCollapsed = collapsedGroupKeys.includes(block.key)}
				<button
					type="button"
					class="mb-2 flex w-full items-center gap-1.5 rounded-full py-1 text-left text-[11px] font-semibold tracking-wide text-stone-400 hover:text-stone-600 dark:text-stone-500 dark:hover:text-stone-300"
					aria-expanded={!groupCollapsed}
					aria-label={groupCollapsed ? `Expand ${block.label}` : `Collapse ${block.label}`}
					onclick={() => toggleGroup(block.key)}
				>
					<ChevronDown class="h-3.5 w-3.5 shrink-0 transition-transform duration-200 motion-reduce:transition-none {groupCollapsed ? '-rotate-90' : ''}" />
					<span class="uppercase">{block.label} ({block.groups.length})</span>
				</button>
				{#if !groupCollapsed}
				<div transition:slide={{ duration: motionMs(180) }}>
				{#each block.groups as group (group.key)}
				<ul class="{group.rows.length > 0 ? 'mb-4 ' : ''}{view === 'compact' ? 'space-y-1.5' : 'space-y-2'}">
					{#each group.rows as row (row.item.id)}
						{@const item = row.item}
						{@const title = stockDisplayTitle(item)}
						{@const size = item.package_size}
						{@const unit = stockUnit(item)}
						{@const totalSize = stockTotalSize(item)}
				{#if view === 'compact'}
					<li class="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2 sm:px-4 sm:py-1">
						<button
							type="button"
							class="flex w-full items-center gap-3 text-left sm:gap-4"
							onclick={() => openView(item)}
						>
							{#if item.photos.length > 0}
								<span class="relative block h-10 w-10 shrink-0">
									<img src={stockPhotoUrl(item.photos[0])} alt="" loading="lazy" class="h-10 w-10 rounded-lg object-cover" />
									{#if item.photos.length > 1}
										<span class="absolute -right-1 -bottom-1 rounded-full bg-stone-900/85 px-1 text-[9px] font-medium text-white">+{item.photos.length - 1}</span>
									{/if}
								</span>
							{:else}
								<span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-300 dark:text-stone-600">
									<Package class="h-4 w-4" aria-hidden="true" />
								</span>
							{/if}
							<div class="min-w-0 flex-1">
								<div class="flex min-w-0 items-baseline gap-2">
									<span class="truncate text-sm font-medium text-stone-800 dark:text-stone-200">{title}</span>
									<span class="hidden min-w-0 flex-1 truncate text-[11px] tabular-nums text-stone-400 dark:text-stone-500 sm:inline">{item.quantity} {item.quantity === 1 ? 'package' : 'packages'}{#if size > 0} × {fmtQty(size, unit)}{/if}{#if (item.brand && item.brand !== title) || item.category} · {#if item.brand && item.brand !== title}{item.brand}{#if item.category} · {/if}{/if}{item.category}{/if}{#if item.expires_at} · Expires {fmtStockDate(item.expires_at, lang)}{/if}</span>
								</div>
								<p class="truncate text-[11px] tabular-nums text-stone-400 dark:text-stone-500 sm:hidden">
									{item.quantity} {item.quantity === 1 ? 'package' : 'packages'}{#if size > 0} × {fmtQty(size, unit)}{/if}{#if (item.brand && item.brand !== title) || item.category} · {#if item.brand && item.brand !== title}{item.brand}{#if item.category} · {/if}{/if}{item.category}{/if}
								</p>
								{#if item.expires_at}
									{@const expiry = stockExpiry(item)}
									{@const days = stockExpiryDays(item)}
									<p class="truncate text-[11px] font-medium {expiry === 'expired' ? 'text-rose-600 dark:text-rose-400' : expiry === 'soon' ? 'text-amber-600 dark:text-amber-400' : 'text-stone-400 dark:text-stone-500'} sm:hidden">
										{#if expiry === 'expired' && days !== null && days < 0}
											Expired {-days} {-days === 1 ? 'day' : 'days'} ago
										{:else if expiry === 'soon' && days !== null}
											Expires in {days} {days === 1 ? 'day' : 'days'}
										{:else}
											Expires {fmtStockDate(item.expires_at, lang)}
										{/if}
									</p>
								{/if}
							</div>
						</button>
					</li>
				{:else}
					<li class="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-4 py-2.5">
						<button
							type="button"
							class="flex w-full items-start gap-3 text-left"
							onclick={() => openView(item)}
						>
							{#if item.photos.length > 0}
								<span class="relative block h-14 w-14 shrink-0">
									<img src={stockPhotoUrl(item.photos[0])} alt="" loading="lazy" class="h-14 w-14 rounded-xl object-cover" />
									{#if item.photos.length > 1}
										<span class="absolute -right-1 -bottom-1 rounded-full bg-stone-900/85 px-1.5 text-[10px] font-medium text-white">+{item.photos.length - 1}</span>
									{/if}
								</span>
							{:else}
								<span class="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-300 dark:text-stone-600">
									<Package class="h-6 w-6" aria-hidden="true" />
								</span>
							{/if}
							<div class="min-w-0 flex-1">
								<p class="truncate text-[15px] font-medium text-stone-800 dark:text-stone-200">{title}</p>
								{#if (item.brand && item.brand !== title) || item.category}
									<p class="mt-0.5 truncate text-[11px] text-stone-400 dark:text-stone-500">{#if item.brand && item.brand !== title}{item.brand}{#if item.category} · {/if}{/if}{item.category}</p>
								{/if}
								{#if size > 0}
									<p class="mt-0.5 truncate text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
										{item.quantity} {item.quantity === 1 ? 'package' : 'packages'} × {fmtQty(size, unit)} = {fmtQty(totalSize, unit)}
									</p>
								{:else}
									<p class="mt-0.5 truncate text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
										{item.quantity} {item.quantity === 1 ? 'package' : 'packages'}
									</p>
								{/if}
								{#if item.expires_at}
									{@const expiry = stockExpiry(item)}
									{@const days = stockExpiryDays(item)}
									<p class="mt-0.5 truncate text-[11px] font-medium {expiry === 'expired' ? 'text-rose-600 dark:text-rose-400' : expiry === 'soon' ? 'text-amber-600 dark:text-amber-400' : 'text-stone-400 dark:text-stone-500'}">
										{#if expiry === 'expired' && days !== null && days < 0}
											Expired {-days} {-days === 1 ? 'day' : 'days'} ago
										{:else if expiry === 'soon' && days !== null}
											Expires in {days} {days === 1 ? 'day' : 'days'}
										{:else}
											Expires {fmtStockDate(item.expires_at, lang)}
										{/if}
									</p>
								{/if}
								{#if item.note}
									<p class="mt-0.5 line-clamp-2 whitespace-pre-wrap text-xs leading-snug text-stone-500 dark:text-stone-400">{item.note}</p>
								{/if}
							</div>
						</button>
					</li>
				{/if}
			{/each}
				</ul>
			{/each}
				</div>
				{/if}
			{/each}
		{/if}
	{:else}
		{#if durables.length === 0}
			<p class="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 px-4 py-8 text-center text-sm text-stone-500 dark:text-stone-400">
				No durables yet — add the first one below.
			</p>
		{:else}
		<ul class={view === 'compact' ? 'space-y-1.5' : 'grid grid-cols-1 gap-2 sm:grid-cols-2'}>
			{#each durables as item (item.id)}
				{@const age = stockAgeParts(item, lang)}
				{#if view === 'compact'}
					<li class="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2 sm:px-4 sm:py-1">
						<button
							type="button"
							class="flex w-full items-center gap-3 text-left sm:gap-4"
							onclick={() => openView(item)}
						>
							{#if item.photos.length > 0}
								<span class="relative block h-10 w-10 shrink-0">
									<img src={stockPhotoUrl(item.photos[0])} alt="" loading="lazy" class="h-10 w-10 rounded-lg object-cover" />
									{#if item.photos.length > 1}
										<span class="absolute -right-1 -bottom-1 rounded-full bg-stone-900/85 px-1 text-[9px] font-medium text-white">+{item.photos.length - 1}</span>
									{/if}
								</span>
							{:else}
								<span class="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-stone-100 dark:bg-stone-800 text-stone-300 dark:text-stone-600">
									<Package class="h-4 w-4" aria-hidden="true" />
								</span>
							{/if}
							<div class="min-w-0 flex-1">
								<div class="flex min-w-0 items-baseline gap-2">
									<span class="truncate text-sm font-medium text-stone-800 dark:text-stone-200">{item.name}</span>
									<span class="hidden min-w-0 flex-1 truncate text-[11px] tabular-nums text-stone-400 dark:text-stone-500 sm:inline">{#if item.brand || item.category}{item.brand}{#if item.brand && item.category} · {/if}{item.category}{/if}{#if item.bought_at}{#if item.brand || item.category} · {/if}{fmtStockDate(item.bought_at, lang)}{/if}{#if item.price !== null}{#if item.brand || item.category || item.bought_at} · {/if}{fmtCurrency(item.price, item.currency || 'BRL', 2)}{/if}</span>
								</div>
								<p class="truncate text-[11px] tabular-nums text-stone-400 dark:text-stone-500 sm:hidden">
									{#if item.brand || item.category}{item.brand}{#if item.brand && item.category} · {/if}{item.category}{/if}
									{#if item.bought_at}{#if item.brand || item.category} · {/if}{fmtStockDate(item.bought_at, lang)}{/if}
									{#if item.price !== null}{#if item.brand || item.category || item.bought_at} · {/if}{fmtCurrency(item.price, item.currency || 'BRL', 2)}{/if}
								</p>
								<p class="mt-0.5 truncate text-[11px] font-medium sm:hidden">
									{#if age}
										<span class="text-stone-400 dark:text-stone-500">{age.prefix}</span>{#if age.duration}{' '}<span class={item.ended_at === null ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-400 dark:text-stone-500'}>{age.duration}</span>{/if}
									{:else}
										<span class="text-stone-400 dark:text-stone-500">Owned</span>
									{/if}
									{#if item.ended_at !== null}
										<span class="text-stone-400 dark:text-stone-500"> · Ended {fmtStockDate(item.ended_at, lang)}</span>
									{/if}
								</p>
							</div>
							<span class="hidden shrink-0 text-right text-[11px] font-medium whitespace-nowrap sm:block">
								{#if age}
									<span class="text-stone-400 dark:text-stone-500">{age.prefix}</span>{#if age.duration}{' '}<span class={item.ended_at === null ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-400 dark:text-stone-500'}>{age.duration}</span>{/if}
								{:else}
									<span class="text-stone-400 dark:text-stone-500">Owned</span>
								{/if}
								{#if item.ended_at !== null}
									<span class="text-stone-400 dark:text-stone-500"> · Ended {fmtStockDate(item.ended_at, lang)}</span>
								{/if}
							</span>
						</button>
					</li>
				{:else}
					<li class="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-4 py-2.5">
						<button
							type="button"
							class="flex w-full items-start gap-3 text-left"
							onclick={() => openView(item)}
						>
							{#if item.photos.length > 0}
								<span class="relative block h-14 w-14 shrink-0">
									<img src={stockPhotoUrl(item.photos[0])} alt="" loading="lazy" class="h-14 w-14 rounded-xl object-cover" />
									{#if item.photos.length > 1}
										<span class="absolute -right-1 -bottom-1 rounded-full bg-stone-900/85 px-1.5 text-[10px] font-medium text-white">+{item.photos.length - 1}</span>
									{/if}
								</span>
							{:else}
								<span class="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-300 dark:text-stone-600">
									<Package class="h-6 w-6" aria-hidden="true" />
								</span>
							{/if}
							<div class="min-w-0 flex-1">
								<p class="truncate text-[15px] font-medium text-stone-800 dark:text-stone-200">{item.name}</p>
								{#if item.brand || item.category}
									<p class="mt-0.5 truncate text-[11px] text-stone-400 dark:text-stone-500">{item.brand}{#if item.brand && item.category} · {/if}{item.category}</p>
								{/if}
								<p class="mt-0.5 truncate text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
									{#if item.bought_at}{fmtStockDate(item.bought_at, lang)}{/if}{#if item.bought_where} · {item.bought_where}{/if}{#if item.price !== null} · {fmtCurrency(item.price, item.currency || 'BRL', 2)}{/if}
								</p>
								{#if item.ended_at === null}
									<p class="mt-0.5 truncate text-[11px] font-medium">
										{#if age}
											<span class="text-stone-400 dark:text-stone-500">{age.prefix}</span>{#if age.duration}{' '}<span class="text-emerald-600 dark:text-emerald-400">{age.duration}</span>{/if}
										{:else}
											<span class="text-stone-400 dark:text-stone-500">Owned</span>
										{/if}
									</p>
								{:else}
									<p class="mt-0.5 text-[11px] font-medium text-stone-400 dark:text-stone-500">Ended {fmtStockDate(item.ended_at, lang)}</p>
									{#if age}
										<p class="mt-0.5 truncate text-[11px] font-medium text-stone-400 dark:text-stone-500">
											{age.prefix}{#if age.duration} {age.duration}{/if}
										</p>
									{/if}
								{/if}
								{#if item.note}
									<p class="mt-0.5 line-clamp-2 whitespace-pre-wrap text-xs leading-snug text-stone-500 dark:text-stone-400">{item.note}</p>
								{/if}
							</div>
						</button>
					</li>
				{/if}
			{/each}
		</ul>
		{/if}
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
		title="Edit {stockDisplayTitle(ep)}"
		submitLabel="Save"
		initial={ep}
		onSubmit={(body) => saveEdit(ep, body)}
		onClose={() => {
			const id = ep.id;
			editing = null;
			viewing = items.find((x) => x.id === id) ?? ep;
		}}
	/>
{/if}

{#if goalsOpen}
	<StockGoalsModal
		goals={categoryGoals}
		initialCategory={goalCategory}
		categoryUnits={categoryUnitInfo.text}
		categoryFamilies={categoryUnitInfo.families}
		categoryGroups={categoryUnitInfo.groups}
		onSave={saveCategoryGoals}
		onClose={() => {
			goalsOpen = false;
			goalCategory = null;
		}}
	/>
{/if}

{#if categoryEditing}
	<StockCategoryModal
		category={categoryEditing.category}
		group={categoryEditing.group}
		goal={categoryEditing.goal}
		units={categoryUnitInfo.text[categoryEditing.category] ?? ''}
		onSaved={() => void load()}
		onClose={() => (categoryEditing = null)}
	/>
{/if}

{#if consuming && viewing !== null}
	{@const cp = items.find((x) => x.id === (viewing as StockItem).id) ?? (viewing as StockItem)}
	<StockConsumeModal
		item={cp}
		onSubmit={(body) => consume(cp, body)}
		onClose={() => (consuming = false)}
	/>
{/if}

{#if viewing !== null}
	{@const vp = items.find((x) => x.id === (viewing as StockItem).id) ?? (viewing as StockItem)}
	{@const vpGroup = consumableGroups.find((g) => g.category === (vp.category || 'No category'))}
	{@const vpGoal = vpGroup?.goal ?? null}
	{@const vpStocked = vpGroup?.have ?? 0}
	<StockViewModal
		item={vp}
		categoryGoal={vpGoal}
		categoryStocked={vpStocked}
		categoryEstimate={vpGroup?.estimate ?? null}
		actions={viewActions}
		lang={lang}
		onConsume={() => (consuming = true)}
		onEdit={() => {
			const current = items.find((x) => x.id === vp.id) ?? vp;
			viewing = null;
			editing = current;
		}}
		onDelete={() => {
			confirming = vp;
			viewing = null;
		}}
		onClose={() => (viewing = null)}
	/>
{/if}

{#if confirming}
	{@const cp = confirming}
	<ConfirmDialog
		title="Delete this item?"
		message="{cp.name} will be permanently removed, along with its photos. This cannot be undone."
		confirmLabel="Delete item"
		cancelLabel="Cancel"
		confirmTone="danger"
		onConfirm={() => void remove(cp)}
		onCancel={() => (confirming = null)}
	/>
{/if}
