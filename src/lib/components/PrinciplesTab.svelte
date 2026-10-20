<script lang="ts">
	import { goto } from '$app/navigation';
	import type { Principle } from '$lib/types';
	import FixedBottomBar from '$lib/components/FixedBottomBar.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import CommentModal from '$lib/components/CommentModal.svelte';
	import VideoPill from '$lib/components/VideoPill.svelte';
	import { youTubeWatchUrl } from '$lib/youtube';
	import Plus from '@lucide/svelte/icons/plus';
	import GripVertical from '@lucide/svelte/icons/grip-vertical';
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import MessageCircle from '@lucide/svelte/icons/message-circle';
	import { fade, fly } from 'svelte/transition';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import { loading } from '$lib/loading.svelte';

	type Props = { onError: (msg: string) => void; widthClass?: string };
	let { onError, widthClass = 'max-w-2xl' }: Props = $props();

	let principles = $state<Principle[]>([]);
	let draft = $state('');
	let draftVideo = $state('');
	let adding = $state(false);
	let draftField = $state<HTMLTextAreaElement | null>(null);
	let editing = $state<string | null>(null);
	let editText = $state('');
	let editVideo = $state('');
	let menuPrinciple = $state<Principle | null>(null);
	let confirmingPrinciple = $state<Principle | null>(null);
	// Comments live in one modal — the same standard in every list. The
	// list itself lives on the principle's own page.
	let commenting = $state<Principle | null>(null);

	let dragId = $state<string | null>(null);
	let overId = $state<string | null>(null);
	let suppressClick = false;
	let dragEl: HTMLElement | null = null;
	let pending: { id: string; x: number; y: number; timer: ReturnType<typeof setTimeout> | null; el: HTMLElement } | null = null;

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

	async function saveEdit(p: Principle) {
		if (!editText.trim()) {
			editing = null;
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
			editing = null;
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

{#snippet commentPill(p: Principle)}
	<button
		type="button"
		class="shrink-0 inline-flex items-center gap-1 rounded-full bg-stone-100 dark:bg-stone-800 px-2 py-0.5 text-[11px] tabular-nums text-stone-500 dark:text-stone-400 hover:bg-stone-200 dark:hover:bg-stone-700"
		aria-haspopup="dialog"
		aria-label="Comments on this principle"
		onclick={() => void openCommentModal(p)}
	><MessageCircle class="h-3 w-3" /> {(p.commentCount ?? 0)}</button>
{/snippet}

<div>
	<ol class="space-y-2">
		{#each principles as p, i (p.id)}
			<li
				data-principle={p.id}
				class="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-4 py-2.5 select-none {dragId === p.id ? 'opacity-40' : ''} {dragId && overId === p.id && dragId !== p.id ? 'ring-1 ring-stone-900 dark:ring-stone-100' : ''}"
				style={dragId ? 'touch-action: none' : ''}
				onpointerdown={(e) => onDown(e, p.id)}
				onpointermove={onMove}
				onpointerup={() => endDrag(true)}
				onpointercancel={() => endDrag(false)}
			>
				<div class="flex items-start gap-3 sm:items-center">
					<span
						role="button"
						tabindex="0"
						aria-label="Drag to reorder"
						title="Drag to reorder"
						class="sm:mt-0 shrink-0 cursor-grab touch-none text-stone-300 dark:text-stone-600 hover:text-stone-600 dark:hover:text-stone-300 active:cursor-grabbing"
						onpointerdown={(e) => onDown(e, p.id, true)}
						onkeydown={(e) => {
							if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
							e.preventDefault();
							const ids = principles.map((x) => x.id);
							const from = ids.indexOf(p.id);
							const to = from + (e.key === 'ArrowUp' ? -1 : 1);
							if (from < 0 || to < 0 || to >= ids.length) return;
							ids.splice(to, 0, ...ids.splice(from, 1));
							void persistOrder(ids);
						}}
					><GripVertical class="h-4 w-4" /></span>
					<span class="sm:mt-0 w-6 shrink-0 text-right text-xs font-semibold tabular-nums text-stone-400 dark:text-stone-500">{i + 1}</span>
					<button
						type="button"
						class="min-w-0 flex-1 text-left text-[15px] text-stone-800 dark:text-stone-200"
						onclick={() => { if (suppressClick) { suppressClick = false; return; } if (!dragId) { editing = p.id; editText = p.content; editVideo = p.video ? youTubeWatchUrl(p.video) : ''; } }}
					>{p.content}</button>
					<!-- sm+: tags and the comment pill share the title line, right-aligned before the ⋮ -->
					<div class="hidden min-w-0 shrink flex-wrap items-center justify-end gap-1 sm:flex">
						{#each p.tags as t (t)}
							<TagChip tag={t} />
						{/each}
						{@render commentPill(p)}
					</div>
					<button type="button" aria-label="Principle actions" class="grid h-8 w-8 shrink-0 place-items-center rounded-full text-stone-300 dark:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300" onclick={() => (menuPrinciple = p)}><EllipsisVertical class="h-4 w-4" /></button>
				</div>
				{#if p.tags.length > 0}
					<!-- Mobile: tags keep their right-aligned row, pill rides at its end. -->
					<div class="mt-1.5 flex flex-wrap items-center justify-end gap-1 sm:hidden">
						{#each p.tags as t (t)}
							<TagChip tag={t} />
						{/each}
						{@render commentPill(p)}
					</div>
				{:else}
					<!-- Mobile, bare card: pill alone is right-aligned on its own line. -->
					<div class="mt-1.5 flex justify-end sm:hidden">{@render commentPill(p)}</div>
				{/if}
				{#if p.video}
					<div class="mt-2 text-left sm:text-right"><VideoPill id={p.video} /></div>
				{/if}
			</li>
		{/each}
	</ol>
	{#if principles.length === 0}
		<p class="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 px-4 py-8 text-center text-sm text-stone-500 dark:text-stone-400">No principles yet — add the first one below.</p>
	{:else}
		<p class="mt-2 text-[11px] leading-snug text-stone-400 dark:text-stone-500">Press and hold a principle to drag it into a new position.</p>
	{/if}
</div>

<FixedBottomBar {widthClass}>
	<button
		type="button"
		class="flex min-h-11 w-full flex-1 items-center justify-center gap-1.5 rounded-full bg-stone-900 dark:bg-stone-700 px-4 py-2 text-sm font-medium whitespace-nowrap text-white"
		onclick={() => { draft = ''; adding = true; }}
	><Plus class="h-4 w-4" /> Add</button>
</FixedBottomBar>

{#if adding}
	<div
		class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 dark:bg-black/60 p-4"
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
			<textarea
				bind:this={draftField}
				rows="3"
				class="mt-3 max-h-[50dvh] min-h-24 w-full resize-none rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-[15px] leading-snug text-stone-800 dark:text-stone-200 outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-stone-400 dark:focus:border-stone-600"
				placeholder="State the principle… (trailing #tags work too)"
				aria-label="Principle text"
				value={draft}
				oninput={(e) => (draft = e.currentTarget.value)}
				onkeydown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void add(); }}
			></textarea>
			<label class="mt-3 block text-xs font-medium text-stone-500 dark:text-stone-400" for="draft-video">YouTube URL (optional)</label>
			<input
				id="draft-video"
				class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-sm text-stone-800 dark:text-stone-200 outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-stone-400 dark:focus:border-stone-600"
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
		class="fixed inset-0 z-50 grid place-items-end bg-stone-900/40 dark:bg-black/60 p-4 sm:place-items-center"
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
					onclick={(e) => { const q = menuPrinciple; menuPrinciple = null; if (q) void goto(`/principles/${q.id}`); }}
				>Open</button>
				<button
					type="button"
					class="flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
					onclick={() => { const q = menuPrinciple; menuPrinciple = null; if (q) { editing = q.id; editText = q.content; editVideo = q.video ? youTubeWatchUrl(q.video) : ''; } }}
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
			class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 dark:bg-black/60 p-4"
			role="dialog"
			aria-modal="true"
			aria-label="Edit principle"
			tabindex="-1"
			onclick={(e) => { if (e.target === e.currentTarget) editing = null; }}
			onkeydown={(e) => { if (e.key === 'Escape') editing = null; }}
			transition:fade={{ duration: motionMs(BACKDROP_MS) }}
		>
			<div class="w-full max-w-sm rounded-2xl bg-white dark:bg-stone-900 p-5 shadow-xl" transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}>
				<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">Edit principle</h2>
				<textarea
					rows="3"
					class="mt-3 max-h-[50dvh] min-h-24 w-full resize-none rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-[15px] leading-snug text-stone-800 dark:text-stone-200 outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-stone-400 dark:focus:border-stone-600"
					aria-label="Principle text"
					value={editText}
					oninput={(e) => (editText = e.currentTarget.value)}
					onkeydown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void saveEdit(ep); }}
				></textarea>
				<label class="mt-3 block text-xs font-medium text-stone-500 dark:text-stone-400" for="edit-p-video">YouTube URL (optional)</label>
				<input
					id="edit-p-video"
					class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-sm text-stone-800 dark:text-stone-200 outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-stone-400 dark:focus:border-stone-600"
					value={editVideo}
					oninput={(e) => (editVideo = e.currentTarget.value)}
					placeholder="https://www.youtube.com/watch?v=…"
					inputmode="url"
				/>
				<div class="mt-4 flex justify-end gap-2">
					<button
						type="button"
						class="rounded-full border border-stone-200 dark:border-stone-800 px-4 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
						onclick={() => (editing = null)}
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
	{/if}
{/if}

{#if commenting}
	{@const p = commenting}
	<CommentModal
		onAdd={(text) => addPrincipleComment(p, text)}
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

