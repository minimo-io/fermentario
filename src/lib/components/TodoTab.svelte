<script lang="ts">
	import { goto } from '$app/navigation';
	import { fade, fly, slide } from 'svelte/transition';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import type { TodoGroup, TodoItem, TodoProgressItem } from '$lib/types';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import MessageCircle from '@lucide/svelte/icons/message-circle';
	import FixedBottomBar from '$lib/components/FixedBottomBar.svelte';
	import { tagColors } from '$lib/tag-colors.svelte';

	type Props = { onError: (msg: string) => void; lang?: string; widthClass?: string };
	let { onError, lang = 'en', widthClass = 'max-w-2xl' }: Props = $props();

	const locale = $derived(lang === 'es' ? 'es-ES' : lang === 'pt' ? 'pt-PT' : 'en-US');

	let groups = $state<TodoGroup[]>([]);
	let activeGroup = $state<string | null>(null);
	let items = $state<TodoItem[]>([]);
	let newGroup = $state('');
	let addingGroup = $state(false);
	let groupField = $state<HTMLInputElement | null>(null);
	let newItem = $state('');
	let renaming = $state<string | null>(null);
	let renameText = $state('');
	let editing = $state<string | null>(null);
	let editText = $state('');
	let editField = $state<HTMLTextAreaElement | null>(null);
	let doneOpen = $state(false);
	let confirmingGroup = $state<TodoGroup | null>(null);
	let confirmingItem = $state<TodoItem | null>(null);
	let addingItem = $state(false);
	let itemField = $state<HTMLTextAreaElement | null>(null);
	const openItems = $derived(items.filter((x) => !x.done));
	const doneItems = $derived(items.filter((x) => x.done));
	let progressView = $state(false);
	let progressItems = $state<TodoProgressItem[]>([]);
	let menuGroup = $state<TodoGroup | null>(null);
	let menuItem = $state<TodoItem | null>(null);
	let menuProgressItem = $state<TodoProgressItem | null>(null);

	async function toggleProgressViewItem(item: TodoProgressItem) {
		try {
			const res = await fetch(`/api/todo/items/${item.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ done: !item.done })
			});
			const d = await res.json();
			if (!res.ok || !d.item) throw new Error(d?.error ?? 'Failed to update item.');
			await loadProgress();
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to update item.');
		}
	}

	async function progressProgressViewItem(item: TodoProgressItem) {
		try {
			const res = await fetch(`/api/todo/items/${item.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ inProgress: !item.inProgress })
			});
			const d = await res.json();
			if (!res.ok || !d.item) throw new Error(d?.error ?? 'Failed to update item.');
			await loadProgress();
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to update item.');
		}
	}

	async function deleteProgressViewItem(item: TodoProgressItem) {
		try {
			const res = await fetch(`/api/todo/items/${item.id}`, { method: 'DELETE' });
			if (!res.ok) throw new Error('Failed to delete item.');
			confirmingItem = null;
			await loadProgress();
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to delete item.');
		}
	}

	async function loadGroups(select?: string) {
		try {
			const d = await (await fetch('/api/todo/groups')).json();
			groups = Array.isArray(d.groups) ? d.groups : [];
			const want = select ?? activeGroup;
			activeGroup = groups.some((g) => g.id === want) ? want : (groups[0]?.id ?? null);
			if (activeGroup) await loadItems(activeGroup);
			else items = [];
			await loadProgress();
		} catch {
			onError('Failed to load to-do groups.');
		}
	}

	async function loadProgress() {
		try {
			const d = await (await fetch('/api/todo/items?inprogress=only')).json();
			progressItems = Array.isArray(d.items) ? d.items : [];
		} catch {
			progressItems = [];
		}
	}

	function openProgress() {
		progressView = true;
		void loadProgress();
	}

	function openGroup(id: string) {
		progressView = false;
		activeGroup = id;
		void loadItems(id);
	}

	async function loadItems(groupId: string) {
		try {
			const d = await (await fetch(`/api/todo/groups/${groupId}/items`)).json();
			items = Array.isArray(d.items) ? d.items : [];
		} catch {
			onError('Failed to load to-do items.');
		}
	}

	async function addGroup() {
		if (!newGroup.trim()) return;
		try {
			const res = await fetch('/api/todo/groups', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name: newGroup })
			});
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to add group.');
			newGroup = '';
			addingGroup = false;
			await loadGroups(d.group.id);
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to add group.');
		}
	}

	async function saveRename(g: TodoGroup) {
		if (!renameText.trim()) {
			renaming = null;
			return;
		}
		try {
			const res = await fetch(`/api/todo/groups/${g.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ name: renameText })
			});
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to rename group.');
			renaming = null;
			groups = groups.map((x) => (x.id === g.id ? d.group : x));
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to rename group.');
		}
	}

	async function deleteGroup(g: TodoGroup) {
		try {
			const res = await fetch(`/api/todo/groups/${g.id}`, { method: 'DELETE' });
			if (!res.ok) throw new Error('Failed to delete group.');
			confirmingGroup = null;
			await loadGroups();
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to delete group.');
		}
	}

	async function addItem() {
		if (!activeGroup || !newItem.trim()) return;
		try {
			const res = await fetch(`/api/todo/groups/${activeGroup}/items`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content: newItem })
			});
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to add item.');
			newItem = '';
			addingItem = false;
			items = [...items, d.item];
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to add item.');
		}
	}

	function autosizeItem() {
		if (!itemField) return;
		itemField.style.height = 'auto';
		itemField.style.height = `${itemField.scrollHeight}px`;
	}

	async function toggleItem(item: TodoItem) {
		try {
			const res = await fetch(`/api/todo/items/${item.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ done: !item.done })
			});
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to update item.');
			if (!d.item) throw new Error(d?.error ?? 'The server answered without the item.');
			items = items.map((x) => (x.id === item.id ? d.item : x));
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to update item.');
		}
	}

	async function progressItem(item: TodoItem) {
		try {
			const res = await fetch(`/api/todo/items/${item.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ inProgress: !item.inProgress })
			});
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to update item.');
			if (!d.item) throw new Error(d?.error ?? 'The server answered without the item.');
			const saved = d.item as TodoItem;
			items = [...items.filter((x) => x.id !== saved.id), saved].sort(
				(a, b) => Number(b.inProgress ?? false) - Number(a.inProgress ?? false) || a.position - b.position
			);
			void loadProgress();
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to update item.');
		}
	}

	async function saveEdit(item: TodoItem) {
		if (!editText.trim()) {
			editing = null;
			return;
		}
		try {
			const res = await fetch(`/api/todo/items/${item.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content: editText })
			});
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to save item.');
			editing = null;
			items = items.map((x) => (x.id === item.id ? d.item : x));
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to save item.');
		}
	}

	async function deleteItem(item: TodoItem) {
		try {
			const res = await fetch(`/api/todo/items/${item.id}`, { method: 'DELETE' });
			if (!res.ok) throw new Error('Failed to delete item.');
			confirmingItem = null;
			items = items.filter((x) => x.id !== item.id);
			void loadProgress();
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to delete item.');
		}
	}

	async function persistOrder(ids: string[]) {
		if (!activeGroup) return;
		try {
			const res = await fetch(`/api/todo/groups/${activeGroup}/items`, {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ids })
			});
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to reorder.');
			items = Array.isArray(d.items) ? d.items : items;
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to reorder.');
		}
	}

	let dragId = $state<string | null>(null);
	let overId = $state<string | null>(null);
	let dragEl: HTMLElement | null = null;
	let suppressClick = false;
	let pending: { id: string; x: number; y: number; timer: ReturnType<typeof setTimeout> | null; el: HTMLElement } | null = null;

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

	function endDrag(commit: boolean) {
		if (dragId && commit && overId && overId !== dragId) {
			const ids = items.map((x) => x.id);
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
			beginDrag(el, id);
			return;
		}
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
		const t = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-item]');
		const id = t?.getAttribute('data-item');
		if (id) overId = id;
	}

	$effect(() => {
		void loadGroups();
		void tagColors.load();
	});

	$effect(() => {
		if (addingGroup && groupField) groupField.focus();
	});

	$effect(() => {
		void newItem;
		if (addingItem && itemField) {
			itemField.focus();
			autosizeItem();
		}
	});

	function autosizeEdit() {
		if (!editField) return;
		editField.style.height = 'auto';
		editField.style.height = `${editField.scrollHeight}px`;
	}

	$effect(() => {
		void editText;
		if (editing && editField) autosizeEdit();
	});
</script>

<div>
	<div class="no-scrollbar -mx-1 mb-4 flex snap-x items-center gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
		<button
			type="button"
			aria-label="New group"
			title="New group"
			class="grid h-7 w-7 shrink-0 snap-start place-items-center rounded-full border border-dashed border-stone-300 bg-white text-stone-500 hover:bg-stone-100 hover:text-stone-800"
			onclick={() => { newGroup = ''; addingGroup = true; }}
		><Plus class="h-4 w-4" /></button>
		<button
			type="button"
			aria-label="In-progress tasks"
			title="In-progress tasks"
			class="inline-flex shrink-0 snap-start items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium {progressView ? 'border-stone-900 bg-stone-900 text-white' : 'border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100'}"
			onclick={openProgress}
		><span class="inline-block h-2 w-2 rounded-full bg-amber-500"></span> In progress ({progressItems.length})</button>
		{#each groups as g (g.id)}
			{#if renaming === g.id}
				<span class="inline-flex shrink-0 snap-start items-center gap-1 rounded-full border border-stone-300 bg-white px-2 py-1">
					<input
						class="w-28 bg-transparent text-xs text-stone-800 outline-none"
						value={renameText}
						oninput={(e) => (renameText = e.currentTarget.value)}
						onkeydown={(e) => { if (e.key === 'Enter') void saveRename(g); if (e.key === 'Escape') renaming = null; }}
					/>
					<button type="button" class="text-xs font-medium text-stone-600 hover:text-stone-900" onclick={() => void saveRename(g)}>Save</button>
				</span>
			{:else}
				<span class="inline-flex shrink-0 snap-start items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium {activeGroup === g.id && !progressView ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-100'}">
					<button type="button" onclick={() => openGroup(g.id)}>{g.name}</button>
					<button type="button" aria-label="Group actions" class="opacity-60 hover:opacity-100" onclick={() => (menuGroup = g)}><EllipsisVertical class="h-3.5 w-3.5" /></button>
				</span>
			{/if}
		{/each}
	</div>

	{#if progressView}
		{#if progressItems.length === 0}
			<p class="rounded-2xl border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-500">Nothing in progress.</p>
		{:else}
			<ul class="space-y-2">
				{#each progressItems as item (item.id)}
					<li class="rounded-2xl border border-stone-200 bg-white px-3 py-2.5">
						<div class="flex items-start gap-1.5">
							<button
								type="button"
								role="checkbox"
								aria-checked={item.done}
								aria-label={item.done ? 'Mark not done' : 'Mark done'}
								class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border {item.done ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 text-transparent'}"
								onclick={() => void toggleProgressViewItem(item)}
							><span class="text-[11px] leading-none">✓</span></button>
							<button type="button" class="min-w-0 flex-1 text-left whitespace-pre-wrap text-[15px] {item.done ? 'text-stone-400 line-through' : 'text-stone-800'}" onclick={() => void goto(`/todo/${item.id}`)}>{item.content}</button>
							<button type="button" aria-label="Item actions" class="grid h-8 w-8 shrink-0 place-items-center rounded-full text-stone-300 hover:bg-stone-100 hover:text-stone-600" onclick={() => (menuProgressItem = item)}><EllipsisVertical class="h-4 w-4" /></button>
						</div>
						<div class="mt-1.5 flex flex-wrap items-center gap-1 pl-12">
							<span class="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-500">{item.groupName}</span>
							<span class="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">In progress</span>
							{#each item.tags as t (t)}
								<TagChip tag={t} />
							{/each}
							{#if (item.commentCount ?? 0) > 0}
								<button type="button" class="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] tabular-nums text-stone-500 hover:bg-stone-200" aria-label="{item.commentCount} comments" onclick={() => void goto(`/todo/${item.id}`)}><MessageCircle class="h-3 w-3" /> {item.commentCount}</button>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	{:else if activeGroup}
		<ul class="space-y-2">
			{#each openItems as item (item.id)}
				<li
					data-item={item.id}
					class="rounded-2xl border border-stone-200 bg-white px-3 py-2.5 select-none {dragId === item.id ? 'opacity-40' : ''} {dragId && overId === item.id && dragId !== item.id ? 'ring-1 ring-stone-900' : ''}"
					style={dragId ? 'touch-action: none' : ''}
					onpointermove={onMove}
					onpointerup={() => endDrag(true)}
					onpointercancel={() => endDrag(false)}
				>
					<div class="flex items-start gap-1.5">
						<span
							role="button"
							tabindex="0"
							aria-label="Drag to reorder"
							title="Drag to reorder"
							class="mt-1 shrink-0 cursor-grab touch-none text-stone-300 hover:text-stone-600 active:cursor-grabbing"
							onpointerdown={(e) => onDown(e, item.id, true)}
							onkeydown={(e) => {
								if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
								e.preventDefault();
								const ids = items.map((x) => x.id);
								const from = ids.indexOf(item.id);
								const to = from + (e.key === 'ArrowUp' ? -1 : 1);
								if (from < 0 || to < 0 || to >= ids.length) return;
								ids.splice(to, 0, ...ids.splice(from, 1));
								void persistOrder(ids);
							}}
						><GripVertical class="h-4 w-4" /></span>
						<button
							type="button"
							role="checkbox"
							aria-checked={item.done}
							aria-label={item.done ? 'Mark not done' : 'Mark done'}
							class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border {item.done ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 text-transparent'}"
							onclick={() => void toggleItem(item)}
						><span class="text-[11px] leading-none">✓</span></button>
						{#if editing === item.id}
							<span class="flex min-w-0 flex-1 gap-2">
								<textarea
									bind:this={editField}
									rows="2"
									class="max-h-[40dvh] min-w-0 flex-1 resize-none bg-transparent text-[15px] leading-snug text-stone-800 outline-none"
									value={editText}
									oninput={(e) => { editText = e.currentTarget.value; autosizeEdit(); }}
									onkeydown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void saveEdit(item); if (e.key === 'Escape') editing = null; }}
								></textarea>
								<button type="button" class="shrink-0 self-start text-xs font-medium text-stone-600 hover:text-stone-900" onclick={() => void saveEdit(item)}>Save</button>
							</span>
						{:else}
							<button type="button" class="min-w-0 flex-1 text-left whitespace-pre-wrap text-[15px] text-stone-800" onclick={() => { if (suppressClick) { suppressClick = false; return; } if (!dragId) { editing = item.id; editText = item.content; } }}>{item.content}</button>
							<button type="button" aria-label="Item actions" class="grid h-8 w-8 shrink-0 place-items-center rounded-full text-stone-300 hover:bg-stone-100 hover:text-stone-600" onclick={() => (menuItem = item)}><EllipsisVertical class="h-4 w-4" /></button>
						{/if}
					</div>
					{#if item.inProgress}
						<span class="mt-1.5 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">In progress</span>
					{/if}
					{#if item.tags.length > 0}
						<div class="mt-1.5 flex flex-wrap gap-1 pl-12">
							{#each item.tags as t (t)}
								<TagChip tag={t} />
							{/each}
						</div>
					{/if}
					{#if (item.commentCount ?? 0) > 0}
						<div class="mt-1.5 pl-12">
							<button type="button" class="inline-flex items-center gap-1 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] tabular-nums text-stone-500 hover:bg-stone-200" aria-label="{item.commentCount} comments" onclick={() => void goto(`/todo/${item.id}`)}><MessageCircle class="h-3 w-3" /> {item.commentCount}</button>
						</div>
					{/if}
				</li>
			{/each}
		</ul>
		{#if openItems.length === 0 && doneItems.length === 0}
			<p class="rounded-2xl border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-500">Nothing here yet.</p>
		{/if}

		{#if doneItems.length > 0}
			<div class="mt-4">
				<button
					type="button"
					class="inline-flex items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium text-stone-500 hover:bg-stone-100"
					aria-expanded={doneOpen}
					onclick={() => (doneOpen = !doneOpen)}
				><span aria-hidden="true">{doneOpen ? '▾' : '▸'}</span> Done ({doneItems.length})</button>
				{#if doneOpen}
					<ul class="mt-2 space-y-2" transition:slide={{ duration: motionMs(180) }}>
						{#each doneItems as item (item.id)}
							<li class="rounded-2xl border border-stone-200/70 bg-white/70 px-3 py-2.5">
								<div class="flex items-start gap-1.5">
									<button
										type="button"
										role="checkbox"
										aria-checked={true}
										aria-label="Mark not done"
										class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-stone-900 bg-stone-900 text-white"
										onclick={() => void toggleItem(item)}
									><span class="text-[11px] leading-none">✓</span></button>
									<button type="button" class="min-w-0 flex-1 text-left whitespace-pre-wrap text-[15px] text-stone-400 line-through" onclick={() => void goto(`/todo/${item.id}`)}>{item.content}</button>
									<button type="button" aria-label="Item actions" class="grid h-8 w-8 shrink-0 place-items-center rounded-full text-stone-300 hover:bg-stone-100 hover:text-stone-600" onclick={() => (menuItem = item)}><EllipsisVertical class="h-4 w-4" /></button>
								</div>
								{#if item.done_at}
									<p class="mt-1 pl-12 text-[11px] tabular-nums text-stone-400">
										done {new Date(item.done_at).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}
									</p>
								{/if}
							</li>
						{/each}
					</ul>
				{/if}
			</div>
		{/if}
	{:else if groups.length === 0}
		<p class="rounded-2xl border border-dashed border-stone-300 px-4 py-10 text-center text-sm text-stone-500">Create a group to start your first list.</p>
	{/if}
</div>

{#if menuProgressItem}
	{@const pm = menuProgressItem}
	<div
		class="fixed inset-0 z-50 grid place-items-end bg-stone-900/40 p-4 sm:place-items-center"
		role="dialog"
		aria-modal="true"
		aria-label="Item actions"
		tabindex="-1"
		onclick={(e) => { if (e.target === e.currentTarget) menuProgressItem = null; }}
		onkeydown={(e) => { if (e.key === 'Escape') menuProgressItem = null; }}
		transition:fade={{ duration: motionMs(BACKDROP_MS) }}
	>
		<div class="w-full max-w-sm rounded-2xl bg-white p-2 shadow-xl" transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}>
			<div class="px-3.5 pb-2 pt-3">
				<h2 class="text-sm font-semibold text-stone-900">Item actions</h2>
				<p class="mt-0.5 line-clamp-2 text-xs text-stone-500">{pm.content}</p>
			</div>
			<div class="flex flex-col">
				<button
					type="button"
					class="flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
					onclick={() => { const item = menuProgressItem; menuProgressItem = null; if (item) void goto(`/todo/${item.id}`); }}
				>Open details</button>
				<button
					type="button"
					class="flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
					onclick={() => { const item = menuProgressItem; menuProgressItem = null; if (item) void toggleProgressViewItem(item); }}
				>{pm.done ? 'Mark not done' : 'Mark done'}</button>
				<button
					type="button"
					class="flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
					onclick={() => { const item = menuProgressItem; menuProgressItem = null; if (item) void progressProgressViewItem(item); }}
				>{pm.inProgress ? 'Mark as not in progress' : 'Mark in progress'}</button>
				<button
					type="button"
					class="flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-rose-600 hover:bg-rose-50"
					onclick={() => { const item = menuProgressItem; menuProgressItem = null; if (item) void deleteProgressViewItem(item); }}
				>Delete</button>
			</div>
		</div>
	</div>
{/if}

{#if menuItem}
	{@const m = menuItem}
	<div
		class="fixed inset-0 z-50 grid place-items-end bg-stone-900/40 p-4 sm:place-items-center"
		role="dialog"
		aria-modal="true"
		aria-label="Item actions"
		tabindex="-1"
		onclick={(e) => { if (e.target === e.currentTarget) menuItem = null; }}
		onkeydown={(e) => { if (e.key === 'Escape') menuItem = null; }}
		transition:fade={{ duration: motionMs(BACKDROP_MS) }}
	>
		<div class="w-full max-w-sm rounded-2xl bg-white p-2 shadow-xl" transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}>
			<div class="px-3.5 pb-2 pt-3">
				<h2 class="text-sm font-semibold text-stone-900">Item actions</h2>
				<p class="mt-0.5 line-clamp-2 text-xs text-stone-500">{m.content}</p>
			</div>
			<div class="flex flex-col">
				<button
					type="button"
					class="flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
					onclick={() => { const item = menuItem; menuItem = null; if (item) void goto(`/todo/${item.id}`); }}
				>Open details</button>
				<button
					type="button"
					class="flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
					onclick={() => { const item = menuItem; menuItem = null; if (item) void toggleItem(item); }}
				>{m.done ? 'Mark not done' : 'Mark done'}</button>
				<button
					type="button"
					class="flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
					onclick={() => { const item = menuItem; menuItem = null; if (item) void progressItem(item); }}
				>{m.inProgress ? 'Mark as not in progress' : 'Mark in progress'}</button>
				<button
					type="button"
					class="flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
					onclick={() => { const item = menuItem; menuItem = null; if (item) { editing = item.id; editText = item.content; } }}
				>Edit</button>
				<button
					type="button"
					class="flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-rose-600 hover:bg-rose-50"
					onclick={() => { const item = menuItem; menuItem = null; if (item) confirmingItem = item; }}
				>Delete</button>
			</div>
		</div>
	</div>
{/if}

{#if menuGroup}
	{@const g = menuGroup}
	<div
		class="fixed inset-0 z-50 grid place-items-end bg-stone-900/40 p-4 sm:place-items-center"
		role="dialog"
		aria-modal="true"
		aria-label="Group actions"
		tabindex="-1"
		onclick={(e) => { if (e.target === e.currentTarget) menuGroup = null; }}
		onkeydown={(e) => { if (e.key === 'Escape') menuGroup = null; }}
		transition:fade={{ duration: motionMs(BACKDROP_MS) }}
	>
		<div class="w-full max-w-sm rounded-2xl bg-white p-2 shadow-xl" transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}>
			<div class="px-3.5 pb-2 pt-3">
				<h2 class="text-sm font-semibold text-stone-900">Group actions</h2>
				<p class="mt-0.5 line-clamp-2 text-xs text-stone-500">{g.name}</p>
			</div>
			<div class="flex flex-col">
				<button
					type="button"
					class="flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
					onclick={() => { const grp = menuGroup; menuGroup = null; if (grp) { renaming = grp.id; renameText = grp.name; } }}
				>Rename</button>
				<button
					type="button"
					class="flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-rose-600 hover:bg-rose-50"
					onclick={() => { const grp = menuGroup; menuGroup = null; if (grp) confirmingGroup = grp; }}
				>Delete</button>
			</div>
		</div>
	</div>
{/if}

{#if addingGroup}
	<div
		class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 p-4"
		role="dialog"
		aria-modal="true"
		aria-label="New group"
		tabindex="-1"
		onclick={(e) => { if (e.target === e.currentTarget) addingGroup = false; }}
		onkeydown={(e) => { if (e.key === 'Escape') addingGroup = false; }}
		transition:fade={{ duration: motionMs(BACKDROP_MS) }}
	>
		<div class="w-full max-w-xs rounded-2xl bg-white p-5 shadow-xl" transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}>
			<h2 class="text-sm font-semibold text-stone-900">New group</h2>
			<input
				bind:this={groupField}
				class="mt-3 w-full rounded-xl border border-stone-200 bg-white p-3 text-sm text-stone-800 outline-none placeholder:text-stone-400 focus:border-stone-400"
				placeholder="Group name…"
				aria-label="Group name"
				value={newGroup}
				oninput={(e) => (newGroup = e.currentTarget.value)}
				onkeydown={(e) => { if (e.key === 'Enter') void addGroup(); }}
			/>
			<div class="mt-4 flex justify-end gap-2">
				<button
					type="button"
					class="rounded-full border border-stone-200 px-4 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100"
					onclick={() => (addingGroup = false)}
				>Cancel</button>
				<button
					type="button"
					class="rounded-full bg-stone-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-stone-800"
					onclick={() => void addGroup()}
				>Create</button>
			</div>
		</div>
	</div>
{/if}

{#if confirmingItem}
	<ConfirmDialog
		title="Delete this item?"
		message="{confirmingItem.content} will be permanently removed. This cannot be undone."
		confirmLabel="Delete item"
		cancelLabel="Cancel"
		confirmTone="danger"
		onConfirm={() => { const item = confirmingItem; if (item) void deleteItem(item); }}
		onCancel={() => (confirmingItem = null)}
	/>
{/if}

{#if confirmingGroup}
	<ConfirmDialog
		title="Delete this group?"
		message="{confirmingGroup.name} and all its items will be deleted. This cannot be undone."
		confirmLabel="Delete group"
		cancelLabel="Cancel"
		confirmTone="danger"
		onConfirm={() => { const g = confirmingGroup; confirmingGroup = null; if (g) void deleteGroup(g); }}
		onCancel={() => (confirmingGroup = null)}
	/>
{/if}

{#if activeGroup && !progressView}
	<FixedBottomBar {widthClass}>
		<button
			type="button"
			class="flex min-h-11 w-full flex-1 items-center justify-center gap-1.5 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium whitespace-nowrap text-white"
			onclick={() => { newItem = ''; addingItem = true; }}
		><Plus class="h-4 w-4" /> Add</button>
	</FixedBottomBar>
{/if}

{#if addingItem}
	<div
		class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 p-4"
		role="dialog"
		aria-modal="true"
		aria-label="New task"
		tabindex="-1"
		onclick={(e) => { if (e.target === e.currentTarget) addingItem = false; }}
		onkeydown={(e) => { if (e.key === 'Escape') addingItem = false; }}
		transition:fade={{ duration: motionMs(BACKDROP_MS) }}
	>
		<div class="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}>
			<h2 class="text-sm font-semibold text-stone-900">New task</h2>
			<textarea
				bind:this={itemField}
				rows="3"
				class="mt-3 max-h-[50dvh] min-h-24 w-full resize-none rounded-xl border border-stone-200 bg-white p-3 text-[15px] leading-snug text-stone-800 outline-none placeholder:text-stone-400 focus:border-stone-400"
				placeholder="Describe the task… (trailing #tags work too)"
				aria-label="Task text"
				value={newItem}
				oninput={(e) => { newItem = e.currentTarget.value; autosizeItem(); }}
				onkeydown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void addItem(); }}
			></textarea>
			<div class="mt-4 flex justify-end gap-2">
				<button
					type="button"
					class="rounded-full border border-stone-200 px-4 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100"
					onclick={() => (addingItem = false)}
				>Cancel</button>
				<button
					type="button"
					class="rounded-full bg-stone-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-stone-800 disabled:opacity-50"
					disabled={!newItem.trim()}
					onclick={() => void addItem()}
				>Create</button>
			</div>
		</div>
	</div>
{/if}
