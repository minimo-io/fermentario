<script module lang="ts">
	// Fold state is module-shared on purpose: the same principle can render in
	// the list and in search/tag views, and the storage key must not clobber.
	let collapsed = $state<Record<string, boolean>>({});
	let foldedLoaded = false;
	const COLLAPSED_KEY = 'ferm:collapsed-principles';
	function loadFoldedOnce() {
		if (foldedLoaded) return;
		foldedLoaded = true;
		try {
			const raw = localStorage.getItem(COLLAPSED_KEY);
			if (!raw) return;
			const parsed = JSON.parse(raw) as unknown;
			if (!Array.isArray(parsed)) return;
			for (const id of parsed) if (typeof id === 'string') collapsed[id] = true;
		} catch {
			// Bad storage never breaks the principles list.
		}
	}
	function persistFolded() {
		try {
			localStorage.setItem(COLLAPSED_KEY, JSON.stringify(Object.keys(collapsed)));
		} catch {
			// Storage full/blocked: the fold still works for the session.
		}
	}
</script>
<script lang="ts">
	import { goto } from '$app/navigation';
	import type { Principle } from '$lib/types';
	import { tick } from 'svelte';
	import FixedBottomBar from '$lib/components/FixedBottomBar.svelte';
	import Kbd from '$lib/components/Kbd.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import { renderPlainLinks } from '$lib/note-links';
	import NoteLinkPills from '$lib/components/NoteLinkPills.svelte';
	import NoteFinder from '$lib/components/NoteFinder.svelte';
	import { dayLocale } from '$lib/dates';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import CommentModal from '$lib/components/CommentModal.svelte';
	import VideoPill from '$lib/components/VideoPill.svelte';
	import { youTubeWatchUrl } from '$lib/youtube';
	import { splitLeadingSubgroup } from '$lib/subgroups';
	import Plus from '@lucide/svelte/icons/plus';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import MessageCircle from '@lucide/svelte/icons/message-circle';
	import Maximize2 from '@lucide/svelte/icons/maximize-2';
	import Minimize2 from '@lucide/svelte/icons/minimize-2';
	import { fade, fly, slide } from 'svelte/transition';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import { loading } from '$lib/loading.svelte';

	type Props = { onError: (msg: string) => void; widthClass?: string; lang?: string };
	let { onError, widthClass = 'max-w-2xl', lang = 'en' }: Props = $props();

	// Add-principle shortcut: desktop pointers only. ⌘⇧A on Mac, Ctrl+Shift+A
	// elsewhere — none of these is reserved by browsers or the OS shell.
	const isMac = typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac');
	const canKeyShortcut = typeof matchMedia !== 'undefined' && matchMedia('(hover: hover) and (pointer: fine)').matches;
	const addShortcutKeys = isMac ? ['⌘', '⇧', 'A'] : ['Ctrl', 'Shift', 'A'];

	function handleAddShortcut(e: KeyboardEvent) {
		if (!canKeyShortcut) return;
		// Never stack on an open modal of this tab.
		if (adding || editing || menuPrinciple || confirmingPrinciple || commenting) return;
		const t = e.target as HTMLElement | null;
		if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
		if (e.isComposing) return;
		if (e.key.toLowerCase() !== 'a' || !e.shiftKey) return;
		if (isMac ? !e.metaKey || e.altKey : !e.ctrlKey || e.altKey) return;
		e.preventDefault();
		draft = '';
		draftVideo = '';
		adding = true;
	}

	let principles = $state<Principle[]>([]);
	let draft = $state('');
	let draftVideo = $state('');
	let adding = $state(false);
	let draftField = $state<HTMLTextAreaElement | null>(null);
	let editField = $state<HTMLTextAreaElement | null>(null);
	let editing = $state<string | null>(null);
	let editText = $state('');
	let editVideo = $state('');
	let editFull = $state(false);
	let menuPrinciple = $state<Principle | null>(null);
	let confirmingPrinciple = $state<Principle | null>(null);
	// Comments live in one modal — the same standard in every list. The
	// list itself lives on the principle's own page.
	let commenting = $state<Principle | null>(null);

	// A leading `(name)` token groups a principle, exactly like To-Do
	// subgroups. The prefix stays in the stored text, so the split is a list
	// view only: /admin/principles/[id], tag pages, search and the RAG text
	// keep the full line. Groups render first, then the ungrouped principles
	// as a plain list (no "Ungrouped" header). Only ungrouped principles
	// carry the display number; grouped ones read in their stored order.
	type PrincipleRow = { p: Principle; content: string; subgroup: string };
	const rows = $derived.by<PrincipleRow[]>(() =>
		principles.map((p) => ({ p, ...splitLeadingSubgroup(p.content) }))
	);
	const ungrouped = $derived(rows.filter((r) => !r.subgroup));
	const groupNames = $derived([...new Set(rows.map((r) => r.subgroup).filter(Boolean))]);
	const displayNum = $derived(new Map(ungrouped.map((r, i) => [r.p.id, i + 1] as const)));
	let collapsedGroups = $state<Record<string, boolean>>({});

	let dragId = $state<string | null>(null);
	let overId = $state<string | null>(null);
	let suppressClick = false;
	let dragEl: HTMLElement | null = null;
	let pending: { id: string; x: number; y: number; timer: ReturnType<typeof setTimeout> | null; el: HTMLElement } | null = null;

	// Fold machinery — same rules as the notes timeline, so a long
	// principle collapses to one clamped line on a chevron tap and the
	// body stays selectable/copyable everywhere. Persisted folds reload
	// with the one-line max-height cap (WebKit under-clamps without it).
	let foldable = $state<Record<string, boolean>>({});
	let maxHeights = $state<Record<string, string>>({});
	let unclamped = $state<Record<string, boolean>>({});
	let textEls: Record<string, HTMLElement | null> = {};
	let foldEls: Record<string, HTMLElement | null> = {};

	$effect(() => {
		loadFoldedOnce();
	});

	$effect(() => {
		void principles.length;
		const onResize = () => void measureFoldable();
		onResize();
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	});

	function measureFoldable() {
		for (const p of principles) {
			const el = textEls[p.id];
			if (!el) continue;
			const lh = parseFloat(getComputedStyle(el).lineHeight) || 20.6;
			if (p.id in collapsed) {
				if (maxHeights[p.id] === undefined) maxHeights[p.id] = `${Math.ceil(lh)}px`;
				continue;
			}
			if (maxHeights[p.id] !== undefined) continue;
			foldable[p.id] = el.getBoundingClientRect().height > lh * 1.5;
		}
	}

	function finishFold(id: string, e: TransitionEvent) {
		if (e.target !== e.currentTarget || e.propertyName !== 'max-height') return;
		if (id in collapsed) {
			delete unclamped[id];
			return;
		}
		delete maxHeights[id];
		delete unclamped[id];
		measureFoldable();
	}

	async function toggleFolded(id: string) {
		const wrapper = foldEls[id];
		const duration = motionMs(180);
		if (!wrapper || !duration) {
			if (id in collapsed) {
				foldable[id] = true;
				delete collapsed[id];
			} else {
				collapsed[id] = true;
			}
			persistFolded();
			delete maxHeights[id];
			delete unclamped[id];
			return;
		}
		const start = wrapper.getBoundingClientRect().height;
		if (id in collapsed) {
			foldable[id] = true;
			delete collapsed[id];
			persistFolded();
			maxHeights[id] = `${start}px`;
			await tick();
			void wrapper.getBoundingClientRect();
			const full = Math.max(wrapper.scrollHeight, textEls[id]?.getBoundingClientRect().height ?? 0);
			maxHeights[id] = `${full}px`;
		} else {
			collapsed[id] = true;
			persistFolded();
			unclamped[id] = true;
			maxHeights[id] = `${start}px`;
			await tick();
			void wrapper.getBoundingClientRect();
			const line = parseFloat(getComputedStyle(textEls[id] ?? wrapper).lineHeight) || 20.6;
			maxHeights[id] = `${Math.ceil(line)}px`;
		}
	}

	async function load() {
		try {
			const d = await (await loading.track(fetch('/api/principles'))).json();
			principles = Array.isArray(d.principles) ? d.principles : [];
		} catch {
			onError('Failed to load principles.');
		}
	}

	async function add() {
		if (!draft.trim()) return;
		try {
			const res = await loading.track(fetch('/api/principles', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content: draft, video: draftVideo.trim() })
			}));
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to add principle.');
			draft = '';
			draftVideo = '';
			adding = false;
			principles = [...principles, d.principle];
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to add principle.');
		}
	}

	function openEdit(p: Principle) {
		editing = p.id;
		editText = p.content;
		editVideo = p.video ? youTubeWatchUrl(p.video) : '';
		editFull = false;
	}

	function closeEdit() {
		editing = null;
		editFull = false;
	}

	async function saveEdit(p: Principle) {
		if (!editText.trim()) {
			closeEdit();
			return;
		}
		try {
			const res = await loading.track(fetch(`/api/principles/${p.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content: editText, video: editVideo.trim() })
			}));
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to save principle.');
			closeEdit();
			principles = principles.map((x) => (x.id === p.id ? d.principle : x));
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to save principle.');
		}
	}

	async function remove(p: Principle) {
		try {
			const res = await loading.track(fetch(`/api/principles/${p.id}`, { method: 'DELETE' }));
			if (!res.ok) throw new Error('Failed to delete principle.');
			confirmingPrinciple = null;
			principles = principles.filter((x) => x.id !== p.id);
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to delete principle.');
		}
	}

	async function openCommentModal(p: Principle) {
		commenting = p;
	}

	async function addPrincipleComment(p: Principle, text: string): Promise<boolean> {
		try {
			const res = await loading.track(fetch(`/api/principles/${p.id}/comments`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content: text })
			}));
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to add comment.');
			principles = principles.map((x) => (x.id === p.id ? { ...x, commentCount: (x.commentCount ?? 0) + 1 } : x));
			return true;
		} catch {
			return false;
		}
	}

	async function persistOrder(ids: string[]) {
		try {
			const res = await loading.track(fetch('/api/principles', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ids })
			}));
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to reorder.');
			principles = d.principles;
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to reorder.');
		}
	}

	function clearPending() {
		if (pending?.timer) clearTimeout(pending.timer);
		pending = null;
	}

	function beginDrag(el: HTMLElement, id: string) {
		dragId = id;
		overId = id;
		dragEl = el;
		el.style.touchAction = 'none';
	}

	function subgroupOf(id: string): string {
		const p = principles.find((x) => x.id === id);
		return p ? splitLeadingSubgroup(p.content).subgroup : '';
	}

	/** Arrow keys move a principle inside its own group: a cross-group swap
	 *  would leave the visible lists unchanged because each group renders in
	 *  stored order. */
	function moveWithinGroup(id: string, dir: -1 | 1) {
		const sg = subgroupOf(id);
		const peers = rows.filter((r) => r.subgroup === sg);
		const at = peers.findIndex((r) => r.p.id === id);
		const target = peers[at + dir];
		if (!target) return;
		const ids = principles.map((p) => p.id);
		const from = ids.indexOf(id);
		const to = ids.indexOf(target.p.id);
		if (from < 0 || to < 0) return;
		ids.splice(to, 0, ...ids.splice(from, 1));
		void persistOrder(ids);
	}

	function endDrag(commit: boolean) {
		// A drop on another group cancels: moving across groups would save an
		// order that neither list shows, because grouping comes from the text.
		if (dragId && commit && overId && overId !== dragId && subgroupOf(dragId) === subgroupOf(overId)) {
			const ids = principles.map((p) => p.id);
			const from = ids.indexOf(dragId);
			const to = ids.indexOf(overId);
			if (from >= 0 && to >= 0) {
				ids.splice(to, 0, ...ids.splice(from, 1));
				suppressClick = true;
				void persistOrder(ids);
			}
		}
		if (pending) {
			pending.el.style.touchAction = '';
			clearPending();
		}
		if (dragEl) {
			dragEl.style.touchAction = '';
			dragEl = null;
		}
		dragId = null;
		overId = null;
	}

	function onDown(e: PointerEvent, id: string, immediate = false) {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		const el = (e.currentTarget as HTMLElement).closest('li') ?? (e.currentTarget as HTMLElement);
		if (e.pointerType === 'mouse' || immediate) {
			// A grip press is a deliberate drag: engage at once, mouse or touch.
			beginDrag(el, id);
			return;
		}
		// Press-and-hold on the row body is the touch fallback. Scroll intent
		// (any movement > 12px before the hold completes) cancels the probe.
		clearPending();
		const timer = setTimeout(() => {
			if (pending) beginDrag(el, id);
		}, 280);
		pending = { id, x: e.clientX, y: e.clientY, timer, el };
	}

	function onMove(e: PointerEvent) {
		if (pending && !dragId) {
			if (Math.hypot(e.clientX - pending.x, e.clientY - pending.y) > 12) clearPending();
			return;
		}
		if (!dragId) return;
		// Capture only once the pointer moves. Capturing on pointerdown retargets
		// the following click away from buttons, so plain taps stop opening
		// things. A real drag engages capture here and keeps its events.
		if (dragEl) {
			try {
				dragEl.setPointerCapture(e.pointerId);
			} catch {}
		}
		const t = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-principle]');
		const id = t?.getAttribute('data-principle');
		if (id) overId = id;
	}

	$effect(() => {
		void load();
	});

	$effect(() => {
		if (adding && draftField) draftField.focus();
	});
</script>

<svelte:window onkeydown={handleAddShortcut} />

{#snippet commentPill(p: Principle)}
	<button
		type="button"
		class="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] tabular-nums {(p.commentCount ?? 0) > 0 ? 'bg-stone-200 text-stone-600 hover:bg-stone-300 dark:bg-stone-700 dark:text-stone-200 dark:hover:bg-stone-600' : 'bg-stone-100 text-stone-500 hover:bg-stone-200 dark:bg-stone-800 dark:text-stone-400 dark:hover:bg-stone-700'}"
		aria-haspopup="dialog"
		aria-label="Comments on this principle"
		onclick={() => void openCommentModal(p)}
	><MessageCircle class="h-3 w-3" /> {(p.commentCount ?? 0)}</button>
{/snippet}

{#snippet principleRow(row: PrincipleRow)}
	<li
		data-principle={row.p.id}
		class="relative rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-4 py-2.5 select-none {dragId === row.p.id ? 'opacity-40' : ''} {dragId && overId === row.p.id && dragId !== row.p.id ? 'ring-1 ring-stone-900 dark:ring-stone-100' : ''}"
		style={dragId ? 'touch-action: none' : ''}
		onpointerdown={(e) => onDown(e, row.p.id)}
		onpointermove={onMove}
		onpointerup={() => endDrag(true)}
		onpointercancel={() => endDrag(false)}
	>
		<!-- The comment pill floats in the top-right corner, clearing the ⋮,
			as on note cards. -->
		<div class="absolute top-2 right-12 z-10">{@render commentPill(row.p)}</div>
		<!-- The ordinal rides the card's top edge instead of taking a fixed
			column beside every row, so the text starts next to the grip. -->
		<span
			class="pointer-events-none absolute -top-2 left-3 z-10 rounded-full bg-white px-1.5 text-[10px] font-semibold tabular-nums text-stone-400 dark:bg-stone-900 dark:text-stone-500"
			aria-hidden="true">{displayNum.get(row.p.id) ?? ''}</span>
		<div class="flex items-start gap-3 sm:items-center">
			<span
				role="button"
				tabindex="0"
				aria-label="Drag to reorder"
				title="Drag to reorder"
				class="sm:mt-0 shrink-0 cursor-grab touch-none text-stone-300 dark:text-stone-600 hover:text-stone-600 dark:hover:text-stone-300 active:cursor-grabbing"
				onpointerdown={(e) => onDown(e, row.p.id, true)}
				onkeydown={(e) => {
					if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
					e.preventDefault();
					moveWithinGroup(row.p.id, e.key === 'ArrowUp' ? -1 : 1);
				}}
			><GripVertical class="h-4 w-4" /></span>
			<div class="min-w-0 flex-1">
				{#if (row.p.linkedNotes?.length ?? 0) > 0}
					<div class="mb-1"><NoteLinkPills links={row.p.linkedNotes ?? []} /></div>
				{/if}
				{#if row.p.id in collapsed || foldable[row.p.id]}
					<div
						bind:this={foldEls[row.p.id]}
						class="transition-[max-height] duration-[180ms] ease-out motion-reduce:transition-none {maxHeights[row.p.id] !== undefined || row.p.id in collapsed ? 'overflow-hidden' : ''}"
						style:max-height={maxHeights[row.p.id]}
						ontransitionend={(e) => finishFold(row.p.id, e)}
					>
						<!-- Fold lives on a small chevron so the body stays
							selectable/copyable and links remain clickable. -->
						<div class="flex items-start">
							<button
								type="button"
								class="-ml-1 mt-px grid h-5 w-5 shrink-0 place-items-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-300"
								onpointerdown={(e) => e.stopPropagation()}
								aria-label={row.p.id in collapsed ? 'Expand principle' : 'Collapse principle'}
								aria-expanded={row.p.id in collapsed ? 'false' : 'true'}
								onclick={() => void toggleFolded(row.p.id)}
							><ChevronDown class="h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none {row.p.id in collapsed ? '-rotate-90' : ''}" /></button>
							<div
								bind:this={textEls[row.p.id]}
								class="min-w-0 flex-1 text-[15px] text-stone-800 dark:text-stone-200 {row.p.id in collapsed && !unclamped[row.p.id] ? 'line-clamp-1' : ''}"
							>
								{@html renderPlainLinks(row.content, row.p.linkedNotes)}
							</div>
						</div>
					</div>
				{:else}
					<p bind:this={textEls[row.p.id]} class="text-[15px] text-stone-800 dark:text-stone-200">{@html renderPlainLinks(row.content, row.p.linkedNotes)}</p>
				{/if}
				<time
					class="mt-0.5 block text-[11px] tabular-nums text-stone-400 dark:text-stone-500"
					datetime={new Date(row.p.created_at).toISOString()}
					title={new Date(row.p.created_at).toLocaleString(dayLocale(lang), {
						day: 'numeric',
						month: 'short',
						year: 'numeric',
						hour: '2-digit',
						minute: '2-digit'
					})}
				>{new Date(row.p.created_at).toLocaleDateString(dayLocale(lang), {
					day: 'numeric',
					month: 'short',
					year: 'numeric'
				})}</time>
			</div>
			<!-- sm+: tags share the title line, right-aligned before the ⋮; the
			comment pill floats in the card corner instead. -->
			<div class="hidden min-w-0 shrink flex-wrap items-center justify-end gap-1 sm:flex">
				{#each row.p.tags as t (t)}
					<TagChip tag={t} />
				{/each}
			</div>
			<button type="button" aria-label="Principle actions" class="grid h-8 w-8 shrink-0 place-items-center rounded-full text-stone-300 dark:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300" onclick={() => (menuPrinciple = row.p)}><EllipsisVertical class="h-4 w-4" /></button>
		</div>
		{#if row.p.tags.length > 0}
			<!-- Mobile: tags keep their right-aligned row. -->
			<div class="mt-1.5 flex flex-wrap items-center justify-end gap-1 sm:hidden">
				{#each row.p.tags as t (t)}
					<TagChip tag={t} />
				{/each}
			</div>
		{/if}
		{#if row.p.video}
			<div class="mt-2 text-left sm:text-right"><VideoPill id={row.p.video} /></div>
		{/if}
	</li>
{/snippet}

<div>
	{#each groupNames as sg, gi (sg)}
		{@const groupRows = rows.filter((r) => r.subgroup === sg)}
		<div class={gi > 0 ? 'mt-3' : ''}>
			<button
				type="button"
				class="inline-flex items-center gap-1.5 rounded-full border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-1 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
				aria-expanded={!collapsedGroups[sg]}
				onclick={() => (collapsedGroups[sg] = !collapsedGroups[sg])}
			><ChevronDown class="h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none {collapsedGroups[sg] ? '-rotate-90' : ''}" /> {sg} ({groupRows.length})</button>
			{#if !collapsedGroups[sg]}
				<ol class="mt-2 space-y-2" transition:slide={{ duration: motionMs(180) }}>
					{#each groupRows as row (row.p.id)}{@render principleRow(row)}{/each}
				</ol>
			{/if}
		</div>
	{/each}
	{#if ungrouped.length > 0}
		<!-- Ungrouped principles sit in a plain list: no section header, no
			numbers on grouped rows. -->
		<div class={groupNames.length > 0 ? 'mt-3' : ''}>
			<ol class="space-y-2">
				{#each ungrouped as row (row.p.id)}{@render principleRow(row)}{/each}
			</ol>
		</div>
	{/if}
	{#if principles.length === 0}
		<p class="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 px-4 py-8 text-center text-sm text-stone-500 dark:text-stone-400">No principles yet — add the first one below.</p>
	{:else}
		<p class="mt-2 text-[11px] leading-snug text-stone-400 dark:text-stone-500">Press and hold a principle to drag it within its group. Groups come from a leading (name) in the text.</p>
	{/if}
</div>

<FixedBottomBar {widthClass}>
	<button
		type="button"
		class="flex min-h-11 w-full flex-1 items-center justify-center gap-1.5 rounded-full bg-stone-900 dark:bg-stone-700 px-4 py-2 text-sm font-medium whitespace-nowrap text-white"
		onclick={() => { draft = ''; draftVideo = ''; adding = true; }}
		aria-keyshortcuts={isMac ? 'Meta+Shift+A' : 'Control+Shift+A'}
	><Plus class="h-4 w-4" /> Add<Kbd keys={addShortcutKeys} tone="dark" /></button>
</FixedBottomBar>

{#if adding}
	<div
		class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 dark:bg-black/60 backdrop-blur-md p-4"
		role="dialog"
		aria-modal="true"
		aria-label="New principle"
		tabindex="-1"
		onclick={(e) => { if (e.target === e.currentTarget) adding = false; }}
		onkeydown={(e) => { if (e.key === 'Escape') adding = false; }}
		transition:fade={{ duration: motionMs(BACKDROP_MS) }}
	>
		<div class="w-full max-w-sm rounded-2xl bg-white dark:bg-stone-900 p-5 shadow-xl" transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}>
			<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">New principle</h2>
			<div class="relative">
				<textarea
					bind:this={draftField}
					rows="3"
					class="mt-3 max-h-[50dvh] min-h-24 w-full resize-none rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base leading-snug text-stone-800 dark:text-stone-200 outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-stone-400 dark:focus:border-stone-600"
					placeholder="State the principle… (trailing #tags work too)"
					aria-label="Principle text"
					value={draft}
					oninput={(e) => (draft = e.currentTarget.value)}
					onkeydown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void add(); }}
				></textarea>
				<NoteFinder textarea={draftField} />
			</div>
			<p class="mt-1.5 text-[11px] leading-snug text-stone-400 dark:text-stone-500">A leading (group) files it under that group; trailing #tags retag it.</p>
			<label class="mt-3 block text-xs font-medium text-stone-500 dark:text-stone-400" for="draft-video">YouTube URL (optional)</label>
			<input
				id="draft-video"
				class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base text-stone-800 dark:text-stone-200 outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-stone-400 dark:focus:border-stone-600"
				value={draftVideo}
				oninput={(e) => (draftVideo = e.currentTarget.value)}
				placeholder="https://www.youtube.com/watch?v=…"
				inputmode="url"
			/>
			<div class="mt-4 flex justify-end gap-2">
				<button
					type="button"
					class="rounded-full border border-stone-200 dark:border-stone-800 px-4 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
					onclick={() => (adding = false)}
				>Cancel</button>
				<button
					type="button"
					class="rounded-full bg-stone-900 dark:bg-stone-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-stone-800 dark:hover:bg-stone-600 disabled:opacity-50"
					disabled={!draft.trim()}
					onclick={() => void add()}
				>Create</button>
			</div>
		</div>
	</div>
{/if}

{#if menuPrinciple}
	{@const mp = menuPrinciple}
	<div
		class="fixed inset-0 z-50 grid place-items-end bg-stone-900/40 dark:bg-black/60 backdrop-blur-md p-4 sm:place-items-center"
		role="dialog"
		aria-modal="true"
		aria-label="Principle actions"
		tabindex="-1"
		onclick={(e) => { if (e.target === e.currentTarget) menuPrinciple = null; }}
		onkeydown={(e) => { if (e.key === 'Escape') menuPrinciple = null; }}
		transition:fade={{ duration: motionMs(BACKDROP_MS) }}
	>
		<div class="w-full max-w-sm rounded-2xl bg-white dark:bg-stone-900 p-2 shadow-xl" transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}>
			<div class="px-3.5 pb-2 pt-3">
				<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">Principle actions</h2>
				<p class="mt-0.5 line-clamp-2 text-xs text-stone-500 dark:text-stone-400">{mp.content}</p>
			</div>
			<div class="flex flex-col">
				<button
					type="button"
					class="flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
					onclick={(e) => { const q = menuPrinciple; menuPrinciple = null; if (q) void goto(`/admin/principles/${q.id}`); }}
				>Open</button>
				<button
					type="button"
					class="flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
					onclick={() => { const q = menuPrinciple; menuPrinciple = null; if (q) openEdit(q); }}
				>Edit</button>
				<button
					type="button"
					class="flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40"
					onclick={() => { const q = menuPrinciple; menuPrinciple = null; if (q) confirmingPrinciple = q; }}
				>Delete</button>
			</div>
		</div>
	</div>
{/if}

{#if editing}
	{@const ep = principles.find((x) => x.id === editing)}
	{#if ep}
		<div
			class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 dark:bg-black/60 backdrop-blur-md transition-[padding] duration-200 ease-out motion-reduce:transition-none {editFull ? 'p-0' : 'p-4'}"
			role="dialog"
			aria-modal="true"
			aria-label="Edit principle"
			tabindex="-1"
			onclick={(e) => { if (e.target === e.currentTarget) closeEdit(); }}
			onkeydown={(e) => {
				if (e.key !== 'Escape') return;
				if (editFull) editFull = false;
				else closeEdit();
			}}
			transition:fade={{ duration: motionMs(BACKDROP_MS) }}
		>
			<div
				class="w-full bg-white dark:bg-stone-900 p-5 shadow-xl [interpolate-size:allow-keywords] transition-[height,max-width,border-radius] duration-200 ease-out motion-reduce:transition-none {editFull ? 'flex h-dvh max-w-full flex-col rounded-none' : 'h-auto max-w-sm rounded-2xl'}"
				transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}
			>
				<div class={editFull ? 'mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col' : ''}>
					<div class="flex items-start justify-between gap-2">
						<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">Edit principle</h2>
						<button
							type="button"
							class="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300"
							aria-label={editFull ? 'Exit full screen' : 'Full screen'}
							aria-pressed={editFull}
							title={editFull ? 'Exit full screen' : 'Full screen'}
							onclick={() => (editFull = !editFull)}
						>
							{#if editFull}<Minimize2 class="h-4 w-4" />{:else}<Maximize2 class="h-4 w-4" />{/if}
						</button>
					</div>
					<div class={editFull ? 'relative flex min-h-0 flex-1 flex-col' : 'relative'}>
						<textarea
							bind:this={editField}
							rows="3"
							class="mt-3 w-full resize-none rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base leading-snug text-stone-800 dark:text-stone-200 outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-stone-400 dark:focus:border-stone-600 {editFull ? 'min-h-0 flex-1' : 'max-h-[50dvh] min-h-24'}"
							aria-label="Principle text"
							value={editText}
							oninput={(e) => (editText = e.currentTarget.value)}
							onkeydown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void saveEdit(ep); }}
						></textarea>
						<NoteFinder textarea={editField} excludeId={ep.id} />
					</div>
					<label class="mt-3 block text-xs font-medium text-stone-500 dark:text-stone-400" for="edit-p-video">YouTube URL (optional)</label>
					<input
						id="edit-p-video"
						class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base text-stone-800 dark:text-stone-200 outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-stone-400 dark:focus:border-stone-600"
						value={editVideo}
						oninput={(e) => (editVideo = e.currentTarget.value)}
						placeholder="https://www.youtube.com/watch?v=…"
						inputmode="url"
					/>
					<div class="mt-4 flex justify-end gap-2">
						<button
							type="button"
							class="rounded-full border border-stone-200 dark:border-stone-800 px-4 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
							onclick={closeEdit}
						>Cancel</button>
						<button
							type="button"
							class="rounded-full bg-stone-900 dark:bg-stone-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-stone-800 dark:hover:bg-stone-600 disabled:opacity-50"
							disabled={!editText.trim()}
							onclick={() => void saveEdit(ep)}
						>Save</button>
					</div>
				</div>
			</div>
		</div>
	{/if}
{/if}

{#if commenting}
	{@const p = commenting}
	<CommentModal
		onSubmit={(text) => addPrincipleComment(p, text)}
		onClose={() => (commenting = null)}
	/>
{/if}

{#if confirmingPrinciple}
	{@const cp = confirmingPrinciple}
	<ConfirmDialog
		title="Delete this principle?"
		message="{cp.content} will be permanently removed, along with its tags and comments. This cannot be undone."
		confirmLabel="Delete principle"
		cancelLabel="Cancel"
		confirmTone="danger"
		onConfirm={() => { const q = confirmingPrinciple; confirmingPrinciple = null; if (q) void remove(q); }}
		onCancel={() => (confirmingPrinciple = null)}
	/>
{/if}

