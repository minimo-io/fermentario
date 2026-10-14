<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import TagChip from '$lib/components/TagChip.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { tagColors } from '$lib/tag-colors.svelte';
	import { contentWidthClass } from '$lib/display';
	import type { TodoItem, TaskComment } from '$lib/types';

	let { data } = $props();
	// svelte-ignore state_referenced_locally
	let item = $state<TodoItem>(data.item);
	// svelte-ignore state_referenced_locally
	let comments = $state<TaskComment[]>(data.comments);
	let lang = $state('en');
	let contentClass = $state('max-w-2xl');
	let draft = $state('');
	let err = $state('');
	let confirmingComment = $state<TaskComment | null>(null);

	const locale = $derived(lang === 'es' ? 'es-ES' : lang === 'pt' ? 'pt-PT' : 'en-US');

	$effect(() => {
		item = data.item;
		comments = data.comments;
	});

	onMount(() => {
		void tagColors.load();
		try {
			const raw = localStorage.getItem('fermentario.config');
			if (raw) {
				const c = JSON.parse(raw) as { entriesLang?: string; contentWidth?: string };
				if (c?.entriesLang) lang = c.entriesLang;
				contentClass = contentWidthClass(c?.contentWidth);
			}
		} catch {}
	});

	function fail(msg: string) {
		err = msg;
		setTimeout(() => (err = ''), 4000);
	}

	function fmt(at: number): string {
		return new Date(at).toLocaleString(locale, {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	async function toggle() {
		try {
			const res = await fetch(`/api/todo/items/${item.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ done: !item.done })
			});
			const d = await res.json();
			if (!res.ok || !d.item) throw new Error(d?.error ?? 'Failed to update task.');
			item = d.item;
		} catch (e) {
			fail((e as Error)?.message ?? 'Failed to update task.');
		}
	}

	async function addComment() {
		if (!draft.trim()) return;
		try {
			const res = await fetch(`/api/todo/items/${item.id}/comments`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content: draft })
			});
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to add comment.');
			draft = '';
			comments = [...comments, d.comment];
		} catch (e) {
			fail((e as Error)?.message ?? 'Failed to add comment.');
		}
	}

	async function deleteComment(c: TaskComment) {
		try {
			const res = await fetch(`/api/todo/items/${item.id}/comments/${c.id}`, { method: 'DELETE' });
			if (!res.ok) throw new Error('Failed to delete comment.');
			confirmingComment = null;
			comments = comments.filter((x) => x.id !== c.id);
		} catch (e) {
			fail((e as Error)?.message ?? 'Failed to delete comment.');
		}
	}
</script>

<svelte:head>
	<title>{item.content.slice(0, 40)} · fermentario</title>
</svelte:head>

<main class="min-h-dvh">
	<div class="mx-auto {contentClass} px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-24">
		<header class="mb-5">
			<button
				type="button"
				class="inline-flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-stone-800"
				onclick={() => { if (window.history.length > 1) window.history.back(); else goto('/'); }}
			>
				<ArrowLeft class="h-3.5 w-3.5" /> Back
			</button>
		</header>

		<article class="rounded-2xl border border-stone-200/80 bg-white/70 px-4 py-3">
			<div class="flex items-start gap-2.5">
				<button
					type="button"
					role="checkbox"
					aria-checked={item.done}
					aria-label={item.done ? 'Mark not done' : 'Mark done'}
					class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border {item.done ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 text-transparent'}"
					onclick={toggle}
				><span class="text-[11px] leading-none">✓</span></button>
				<div class="min-w-0 flex-1">
					<p class="whitespace-pre-wrap text-[15px] leading-snug {item.done ? 'text-stone-400 line-through' : 'text-stone-800'}">{item.content}</p>
					{#if item.inProgress}
						<span class="mt-1.5 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800">In progress</span>
					{/if}
					<p class="mt-1 text-[11px] tabular-nums text-stone-400">
						created {fmt(item.created_at)}{#if item.done && item.done_at} · done {fmt(item.done_at)}{/if}
					</p>
				</div>
			</div>
			{#if item.tags.length > 0}
				<div class="mt-2 flex flex-wrap gap-1">
					{#each item.tags as tag (tag)}
						<TagChip {tag} picker={false} />
					{/each}
				</div>
			{/if}
		</article>

		<section class="mt-6" aria-label="History">
			<h2 class="mb-1 text-xs font-medium uppercase tracking-widest text-stone-400">History</h2>
			{#if comments.length === 0}
				<p class="rounded-2xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-500">
					No comments yet — narrate how this task evolves.
				</p>
			{:else}
				<ul class="space-y-2">
					{#each comments as c (c.id)}
						<li class="rounded-2xl border border-stone-200 bg-white px-4 py-2.5">
							<p class="whitespace-pre-wrap text-[15px] leading-snug text-stone-800">{c.content}</p>
							<div class="mt-1 flex items-center justify-between gap-2">
								<span class="text-[11px] tabular-nums text-stone-400">{fmt(c.created_at)}</span>
								<button type="button" aria-label="Delete comment" class="text-stone-300 hover:text-rose-600" onclick={() => (confirmingComment = c)}>×</button>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
			<form class="mt-3 flex gap-2" onsubmit={(e) => { e.preventDefault(); void addComment(); }}>
				<input
					class="min-w-0 flex-1 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-800 outline-none placeholder:text-stone-400"
					placeholder="Add a comment…"
					aria-label="Add a comment"
					value={draft}
					oninput={(e) => (draft = e.currentTarget.value)}
				/>
				<button type="submit" class="shrink-0 rounded-full bg-stone-900 px-4 py-2 text-xs font-medium whitespace-nowrap text-white">Add</button>
			</form>
		</section>
	</div>
</main>

{#if confirmingComment}
	{@const c = confirmingComment}
	<ConfirmDialog
		title="Delete this comment?"
		message="The comment will be permanently removed. The task itself stays."
		confirmLabel="Delete comment"
		cancelLabel="Cancel"
		confirmTone="danger"
		onConfirm={() => { const cc = confirmingComment; confirmingComment = null; if (cc) void deleteComment(cc); }}
		onCancel={() => (confirmingComment = null)}
	/>
{/if}

{#if err}
	<div class="pointer-events-none fixed inset-x-0 bottom-10 z-30 flex justify-center px-6">
		<p class="rounded-full bg-rose-50 px-4 py-1.5 text-xs text-rose-600 shadow-sm">{err}</p>
	</div>
{/if}
