<script lang="ts">
	import type { Principle } from '$lib/types';
	import FixedBottomBar from '$lib/components/FixedBottomBar.svelte';

	type Props = { onError: (msg: string) => void; widthClass?: string };
	let { onError, widthClass = 'max-w-2xl' }: Props = $props();

	let principles = $state<Principle[]>([]);
	let draft = $state('');
	let editing = $state<string | null>(null);
	let editText = $state('');

	let dragId = $state<string | null>(null);
	let overId = $state<string | null>(null);
	let suppressClick = false;
	let pending: { id: string; x: number; y: number; timer: ReturnType<typeof setTimeout> | null; el: HTMLElement } | null = null;

	async function load() {
		try {
			const d = await (await fetch('/api/principles')).json();
			principles = Array.isArray(d.principles) ? d.principles : [];
		} catch {
			onError('Failed to load principles.');
		}
	}

	async function add() {
		if (!draft.trim()) return;
		try {
			const res = await fetch('/api/principles', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content: draft })
			});
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to add principle.');
			draft = '';
			principles = [...principles, d.principle];
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to add principle.');
		}
	}

	async function saveEdit(p: Principle) {
		if (!editText.trim()) {
			editing = null;
			return;
		}
		try {
			const res = await fetch(`/api/principles/${p.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content: editText })
			});
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to save principle.');
			editing = null;
			principles = principles.map((x) => (x.id === p.id ? d.principle : x));
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to save principle.');
		}
	}

	async function remove(p: Principle) {
		try {
			const res = await fetch(`/api/principles/${p.id}`, { method: 'DELETE' });
			if (!res.ok) throw new Error('Failed to delete principle.');
			principles = principles.filter((x) => x.id !== p.id);
		} catch (e) {
			onError((e as Error)?.message ?? 'Failed to delete principle.');
		}
	}

	async function persistOrder(ids: string[]) {
		try {
			const res = await fetch('/api/principles', {
				method: 'PUT',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ids })
			});
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
		el.style.touchAction = 'none';
	}

	function endDrag(commit: boolean) {
		if (dragId && commit && overId && overId !== dragId) {
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
		dragId = null;
		overId = null;
	}

	function onDown(e: PointerEvent, id: string) {
		if (e.pointerType === 'mouse' && e.button !== 0) return;
		const el = e.currentTarget as HTMLElement;
		if (e.pointerType === 'mouse') {
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
		const t = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('[data-principle]');
		const id = t?.getAttribute('data-principle');
		if (id) overId = id;
	}

	$effect(() => {
		void load();
	});
</script>

<div>
	<ol class="space-y-2">
		{#each principles as p, i (p.id)}
			<li
				data-principle={p.id}
				class="flex items-start gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-2.5 select-none {dragId === p.id ? 'opacity-40' : ''} {dragId && overId === p.id && dragId !== p.id ? 'ring-1 ring-stone-900' : ''}"
				style={dragId ? 'touch-action: none' : ''}
				onpointerdown={(e) => onDown(e, p.id)}
				onpointermove={onMove}
				onpointerup={() => endDrag(true)}
				onpointercancel={() => endDrag(false)}
			>
				<span class="mt-0.5 w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-stone-400">{i + 1}</span>
				{#if editing === p.id}
					<span class="flex min-w-0 flex-1 gap-2">
						<input
							class="min-w-0 flex-1 bg-transparent text-[15px] text-stone-800 outline-none"
							value={editText}
							oninput={(e) => (editText = e.currentTarget.value)}
							onkeydown={(e) => { if (e.key === 'Enter') void saveEdit(p); if (e.key === 'Escape') editing = null; }}
						/>
						<button type="button" class="shrink-0 text-xs font-medium text-stone-600 hover:text-stone-900" onclick={() => void saveEdit(p)}>Save</button>
					</span>
				{:else}
					<button
						type="button"
						class="min-w-0 flex-1 text-left text-[15px] text-stone-800"
						onclick={() => { if (suppressClick) { suppressClick = false; return; } if (!dragId) { editing = p.id; editText = p.content; } }}
					>{p.content}</button>
					<button type="button" aria-label="Delete principle" class="shrink-0 text-stone-400 hover:text-rose-600" onclick={() => void remove(p)}>×</button>
				{/if}
			</li>
		{/each}
	</ol>
	{#if principles.length === 0}
		<p class="rounded-2xl border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-500">No principles yet — add the first one below.</p>
	{:else}
		<p class="mt-2 text-[11px] leading-snug text-stone-400">Press and hold a principle to drag it into a new position.</p>
	{/if}
</div>

<FixedBottomBar {widthClass}>
	<form class="flex min-w-0 flex-1 items-center gap-2" onsubmit={(e) => { e.preventDefault(); void add(); }}>
		<input
			class="min-h-11 w-full min-w-0 flex-1 bg-transparent px-2 py-2.5 text-[15px] leading-snug text-stone-800 outline-none placeholder:text-stone-400"
			placeholder="New principle…"
			aria-label="New principle"
			value={draft}
			oninput={(e) => (draft = e.currentTarget.value)}
		/>
		<button type="submit" class="shrink-0 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium whitespace-nowrap text-white">Add</button>
	</form>
</FixedBottomBar>
