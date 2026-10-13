<script lang="ts">
	import type { TodoGroup, TodoItem } from '$lib/types';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import Plus from '@lucide/svelte/icons/plus';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import { tagColors } from '$lib/tag-colors.svelte';

	type Props = { onError: (msg: string) => void; lang?: string };
	let { onError, lang = 'en' }: Props = $props();

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
	let confirmingGroup = $state<TodoGroup | null>(null);
	let confirmingItem = $state<TodoItem | null>(null);

	async function loadGroups(select?: string) {
		try {
			const d = await (await fetch('/api/todo/groups')).json();
			groups = Array.isArray(d.groups) ? d.groups : [];
			const want = select ?? activeGroup;
			activeGroup = groups.some((g) => g.id === want) ? want : (groups[0]?.id ?? null);
			if (activeGroup) await loadItems(activeGroup);
			else items = [];
		} catch {
			onError('Failed to load to-do groups.');
		}
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
			items = [...items, d.item];
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to add item.');
		}
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
			items = items.map((x) => (x.id === item.id ? d.item : x));
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
</script>

<div>
	<div class="mb-4 flex flex-wrap items-center gap-2">
		{#if addingGroup}
			<span class="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-white px-2 py-1">
				<input
					bind:this={groupField}
					class="w-28 bg-transparent text-xs text-stone-800 outline-none placeholder:text-stone-400"
					placeholder="New group…"
					value={newGroup}
					oninput={(e) => (newGroup = e.currentTarget.value)}
					onkeydown={(e) => { if (e.key === 'Enter') void addGroup(); if (e.key === 'Escape') { addingGroup = false; newGroup = ''; } }}
				/>
				<button type="button" class="text-xs font-medium text-stone-600 hover:text-stone-900" onclick={() => void addGroup()}>Add</button>
				<button type="button" aria-label="Cancel" class="text-xs text-stone-400 hover:text-stone-600" onclick={() => { addingGroup = false; newGroup = ''; }}>×</button>
			</span>
		{:else}
			<button
				type="button"
				aria-label="New group"
				title="New group"
				class="grid h-7 w-7 place-items-center rounded-full border border-dashed border-stone-300 bg-white text-stone-500 hover:bg-stone-100 hover:text-stone-800"
				onclick={() => (addingGroup = true)}
			><Plus class="h-4 w-4" /></button>
		{/if}
		{#each groups as g (g.id)}
			{#if renaming === g.id}
				<span class="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-white px-2 py-1">
					<input
						class="w-28 bg-transparent text-xs text-stone-800 outline-none"
						value={renameText}
						oninput={(e) => (renameText = e.currentTarget.value)}
						onkeydown={(e) => { if (e.key === 'Enter') void saveRename(g); if (e.key === 'Escape') renaming = null; }}
					/>
					<button type="button" class="text-xs font-medium text-stone-600 hover:text-stone-900" onclick={() => void saveRename(g)}>Save</button>
				</span>
			{:else}
				<span class="inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium {activeGroup === g.id ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-100'}">
					<button type="button" onclick={() => { activeGroup = g.id; void loadItems(g.id); }}>{g.name}</button>
					<button type="button" aria-label="Rename {g.name}" class="opacity-60 hover:opacity-100" onclick={() => { renaming = g.id; renameText = g.name; }}>✎</button>
					<button type="button" aria-label="Delete {g.name}" class="opacity-60 hover:opacity-100" onclick={() => (confirmingGroup = g)}>×</button>
				</span>
			{/if}
		{/each}
	</div>

	{#if activeGroup}
		<form class="sticky top-0 z-10 -mx-1 bg-white/95 px-1 py-2 backdrop-blur" onsubmit={(e) => { e.preventDefault(); void addItem(); }}>
			<div class="flex gap-2">
				<input
					class="min-w-0 flex-1 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-800 shadow-sm outline-none placeholder:text-stone-400"
					placeholder="New item… (trailing #tags work too)"
					value={newItem}
					oninput={(e) => (newItem = e.currentTarget.value)}
				/>
				<button type="submit" class="shrink-0 rounded-full bg-stone-900 px-4 py-2 text-xs font-medium text-white">Add</button>
			</div>
		</form>
		<ul class="space-y-2">
			{#each items as item (item.id)}
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
								<input
									class="min-w-0 flex-1 bg-transparent text-[15px] text-stone-800 outline-none"
									value={editText}
									oninput={(e) => (editText = e.currentTarget.value)}
									onkeydown={(e) => { if (e.key === 'Enter') void saveEdit(item); if (e.key === 'Escape') editing = null; }}
								/>
								<button type="button" class="shrink-0 text-xs font-medium text-stone-600 hover:text-stone-900" onclick={() => void saveEdit(item)}>Save</button>
							</span>
						{:else}
							<button type="button" class="min-w-0 flex-1 text-left text-[15px] {item.done ? 'text-stone-400 line-through' : 'text-stone-800'}" onclick={() => { if (suppressClick) { suppressClick = false; return; } if (!dragId) { editing = item.id; editText = item.content; } }}>{item.content}</button>
							<button type="button" aria-label="Delete item" class="shrink-0 text-stone-400 hover:text-rose-600" onclick={() => (confirmingItem = item)}>×</button>
						{/if}
					</div>
					{#if item.done && item.done_at}
						<p class="mt-1 pl-7 text-[11px] tabular-nums text-stone-400">
							done {new Date(item.done_at).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}
						</p>
					{/if}
					{#if item.tags.length > 0}
						<div class="mt-1.5 flex flex-wrap gap-1 pl-7">
							{#each item.tags as t (t)}
								<TagChip tag={t} />
							{/each}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
		{#if items.length === 0}
			<p class="rounded-2xl border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-500">Nothing here yet.</p>
		{/if}
	{:else if groups.length === 0}
		<p class="rounded-2xl border border-dashed border-stone-300 px-4 py-10 text-center text-sm text-stone-500">Create a group to start your first list.</p>
	{/if}
</div>

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
