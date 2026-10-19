<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import MessageCircle from '@lucide/svelte/icons/message-circle';
	import TagChip from '$lib/components/TagChip.svelte';
	import VideoPill from '$lib/components/VideoPill.svelte';
	import CommentModal from '$lib/components/CommentModal.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import { contentWidthClass } from '$lib/display';
	import { loading } from '$lib/loading.svelte';
	import type { Principle, PrincipleComment } from '$lib/types';

	let { data } = $props();
	// svelte-ignore state_referenced_locally
	let principle = $state<Principle>(data.principle);
	// svelte-ignore state_referenced_locally
	let comments = $state<PrincipleComment[]>(data.comments);
	let lang = $state('en');
	let contentClass = $state('max-w-2xl');
	let err = $state('');
	let addingComment = $state(false);
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

	function fail(msg: string) {
		err = msg;
		setTimeout(() => (err = ''), 4000);
	}

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
			comments = [...comments, d.comment as PrincipleComment];
			return true;
		} catch {
			return false;
		}
	}

	async function deleteComment(c: { id: string }) {
		try {
			const res = await loading.track(fetch(`/api/principles/${principle.id}/comments/${c.id}`, { method: 'DELETE' }));
			if (!res.ok) throw new Error('Failed to delete comment.');
			comments = comments.filter((x) => x.id !== c.id);
		} catch (e) {
			fail((e as Error)?.message ?? 'Failed to delete comment.');
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
				class="inline-flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-stone-800"
				onclick={() => { if (window.history.length > 1) window.history.back(); else goto('/'); }}
			>
				<ArrowLeft class="h-3.5 w-3.5" /> All principles
			</button>
			<p class="mt-3 text-[11px] tabular-nums text-stone-400">
				{new Date(principle.created_at).toLocaleString(lang === 'es' ? 'es-ES' : lang === 'pt' ? 'pt-PT' : 'en-US', {
					weekday: 'long',
					day: 'numeric',
					month: 'long',
					year: 'numeric'
				})}
			</p>
		</header>

		<article class="rounded-2xl border border-stone-200/80 bg-white/70 px-4 py-3">
			<p class="whitespace-pre-wrap text-[15px] leading-snug text-stone-800">{principle.content}</p>
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
				<h2 class="text-xs font-medium uppercase tracking-widest text-stone-400">Comments</h2>
				<button
					type="button"
					class="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100"
					aria-haspopup="dialog"
					onclick={() => (addingComment = true)}
				><MessageCircle class="h-3.5 w-3.5" /> Add comment</button>
			</div>
			{#if comments.length === 0}
				<p class="rounded-2xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-500">
					No comments yet — narrate how this principle evolves.
				</p>
			{:else}
				<ul class="space-y-2">
					{#each comments as c (c.id)}
						<li class="rounded-2xl border border-stone-200 bg-white px-4 py-2.5">
							<p class="whitespace-pre-wrap text-[15px] leading-snug text-stone-800">{c.content}</p>
							<div class="mt-1 flex items-center justify-between gap-2">
								<span class="text-[11px] tabular-nums text-stone-400">
									{new Date(c.created_at).toLocaleDateString(lang === 'es' ? 'es-ES' : lang === 'pt' ? 'pt-PT' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
								</span>
								<button
									type="button"
									aria-label="Delete comment"
									class="shrink-0 text-stone-300 hover:text-rose-600"
									onclick={() => (confirmingComment = c)}
								>&times;</button>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</main>

{#if addingComment}
	<CommentModal
		onAdd={addComment}
		onClose={() => (addingComment = false)}
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

{#if err}
	<div class="pointer-events-none fixed inset-x-0 bottom-10 z-30 flex justify-center px-6">
		<p class="rounded-full bg-rose-50 px-4 py-1.5 text-xs text-rose-600 shadow-sm">{err}</p>
	</div>
{/if}
