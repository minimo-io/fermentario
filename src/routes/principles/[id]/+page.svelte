<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import MessageCircle from '@lucide/svelte/icons/message-circle';
	import TagChip from '$lib/components/TagChip.svelte';
	import VideoPill from '$lib/components/VideoPill.svelte';
	import CommentModal from '$lib/components/CommentModal.svelte';
	import CommentItem from '$lib/components/CommentItem.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import EntityTitle from '$lib/components/EntityTitle.svelte';
	import { contentWidthClass } from '$lib/display';
	import { sortComments } from '$lib/comments';
	import { loading } from '$lib/loading.svelte';
	import { showToast } from '$lib/toast.svelte';
	import type { Principle, PrincipleComment } from '$lib/types';

	let { data } = $props();
	// svelte-ignore state_referenced_locally
	let principle = $state<Principle>(data.principle);
	// svelte-ignore state_referenced_locally
	let comments = $state<PrincipleComment[]>(data.comments);
	let lang = $state('en');
	let contentClass = $state('max-w-2xl');
	let addingComment = $state(false);
	let editingComment = $state<PrincipleComment | null>(null);
	let confirmingComment = $state<PrincipleComment | null>(null);

	$effect(() => {
		principle = data.principle;
		comments = data.comments;
	});

	onMount(() => {
		try {
			const raw = localStorage.getItem('fermentario.config');
			if (raw) {
				const c = JSON.parse(raw) as { entriesLang?: string; contentWidth?: string };
				if (c?.entriesLang) lang = c.entriesLang;
				contentClass = contentWidthClass(c?.contentWidth);
			}
		} catch {}
	});

	async function refresh() {
		const res = await loading.track(fetch(`/api/principles`));
		if (res.ok) {
			const d = (await res.json()) as { principles?: Principle[] };
			const found = d.principles?.find((p) => p.id === principle.id);
			if (found) principle = found;
		}
		const cres = await loading.track(fetch(`/api/principles/${principle.id}/comments`));
		if (cres.ok) {
			const c = (await cres.json()) as { comments?: PrincipleComment[] };
			comments = c.comments ?? [];
		}
		await loading.track(invalidateAll());
	}

	async function addComment(text: string): Promise<boolean> {
		try {
			const res = await loading.track(fetch(`/api/principles/${principle.id}/comments`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content: text })
			}));
			const d = await res.json();
			if (!res.ok) return false;
			comments = sortComments([d.comment as PrincipleComment, ...comments]);
			return true;
		} catch {
			return false;
		}
	}

	async function updateComment(c: PrincipleComment, text: string): Promise<boolean> {
		try {
			const res = await loading.track(fetch(`/api/principles/${principle.id}/comments/${c.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content: text })
			}));
			const d = await res.json();
			if (!res.ok) return false;
			comments = sortComments(comments.map((x) => (x.id === c.id ? (d.comment as PrincipleComment) : x)));
			return true;
		} catch {
			return false;
		}
	}

	async function togglePin(c: PrincipleComment) {
		try {
			const res = await loading.track(fetch(`/api/principles/${principle.id}/comments/${c.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ pinned: !c.pinned })
			}));
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to update comment.');
			comments = sortComments(comments.map((x) => (x.id === c.id ? (d.comment as PrincipleComment) : x)));
		} catch (e) {
			showToast((e as Error)?.message ?? 'Failed to update comment.');
		}
	}

	async function deleteComment(c: { id: string }) {
		try {
			const res = await loading.track(fetch(`/api/principles/${principle.id}/comments/${c.id}`, { method: 'DELETE' }));
			if (!res.ok) throw new Error('Failed to delete comment.');
			comments = comments.filter((x) => x.id !== c.id);
		} catch (e) {
			showToast((e as Error)?.message ?? 'Failed to delete comment.');
		}
	}
</script>

<svelte:head>
	<title>{principle.content.slice(0, 40)} · fermentario</title>
</svelte:head>

<main class="min-h-dvh">
	<div class="mx-auto {contentClass} px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-24">
		<header class="mb-5">
			<button
				type="button"
				class="inline-flex items-center gap-1 text-xs font-medium text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200"
				onclick={() => { if (window.history.length > 1) window.history.back(); else goto('/'); }}
			>
				<ArrowLeft class="h-3.5 w-3.5" /> All principles
			</button>
			<EntityTitle label="Principle" id={principle.id} />
			<p class="mt-1 text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
				{new Date(principle.created_at).toLocaleString(lang === 'es' ? 'es-ES' : lang === 'pt' ? 'pt-PT' : 'en-US', {
					weekday: 'long',
					day: 'numeric',
					month: 'long',
					year: 'numeric'
				})}
			</p>
		</header>

		<article class="rounded-2xl border border-stone-200/80 dark:border-stone-800/80 bg-white/70 dark:bg-stone-900/70 px-4 py-3">
			<p class="whitespace-pre-wrap text-[15px] font-semibold leading-snug text-stone-800 dark:text-stone-200">{principle.content}</p>
			{#if (principle.tags ?? []).length > 0}
				<div class="mt-2 flex flex-wrap gap-1">
					{#each principle.tags ?? [] as tag (tag)}
						<TagChip {tag} />
					{/each}
				</div>
			{/if}
			{#if principle.video}
				<div class="mt-2"><VideoPill id={principle.video} /></div>
			{/if}
		</article>

		<section class="mt-6" aria-label="Comments on this principle">
			<div class="mb-1 flex items-center justify-between gap-2">
				<h2 class="text-xs font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500">Comments</h2>
				<button
					type="button"
					class="inline-flex items-center gap-1 rounded-full border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-1 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
					aria-haspopup="dialog"
					onclick={() => (addingComment = true)}
				><MessageCircle class="h-3.5 w-3.5" /> Add comment</button>
			</div>
			{#if comments.length === 0}
				<p class="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 px-4 py-6 text-center text-sm text-stone-500 dark:text-stone-400">
					No comments yet — narrate how this principle evolves.
				</p>
			{:else}
				<ul class="space-y-2">
					{#each comments as c (c.id)}
						<CommentItem
							id={c.id}
							content={c.content}
							date={new Date(c.created_at).toLocaleDateString(lang === 'es' ? 'es-ES' : lang === 'pt' ? 'pt-PT' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
							pinned={c.pinned}
							onPin={() => void togglePin(c)}
							onEdit={() => (editingComment = c)}
							onDelete={() => (confirmingComment = c)}
						/>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</main>

{#if addingComment}
	<CommentModal
		onSubmit={addComment}
		onClose={() => (addingComment = false)}
	/>
{/if}

{#if editingComment}
	{@const c = editingComment}
	<CommentModal
		title="Edit comment"
		placeholder="Edit comment…"
		submitLabel="Save"
		successMessage="Comment updated."
		initial={c.content}
		onSubmit={(text) => updateComment(c, text)}
		onClose={() => (editingComment = null)}
	/>
{/if}

{#if confirmingComment}
	<ConfirmDialog
		title="Delete this comment?"
		message="The comment is removed from this principle only. Everything else stays."
		confirmLabel="Delete comment"
		cancelLabel="Cancel"
		confirmTone="danger"
		onConfirm={() => { const c = confirmingComment; confirmingComment = null; if (c) void deleteComment(c); }}
		onCancel={() => (confirmingComment = null)}
	/>
{/if}

