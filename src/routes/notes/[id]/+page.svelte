<script lang="ts">
	import { onMount } from 'svelte';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import MessageCircle from '@lucide/svelte/icons/message-circle';
	import NoteBody from '$lib/components/NoteBody.svelte';
	import PublicHeader from '$lib/components/PublicHeader.svelte';
	import { SLOGAN } from '$lib/brand';
	import CommentItem from '$lib/components/CommentItem.svelte';
	import CommentModal from '$lib/components/CommentModal.svelte';
	import { contentWidthClass } from '$lib/display';
	import { sortComments } from '$lib/comments';
	import { loading } from '$lib/loading.svelte';
	import { showToast } from '$lib/toast.svelte';
	import type { NoteComment } from '$lib/types';

	let { data } = $props();
	// svelte-ignore state_referenced_locally
	let note = $state(data.note);
	// svelte-ignore state_referenced_locally
	let comments = $state<NoteComment[]>(data.comments);
	let lang = $state('en');
	let contentClass = $state('max-w-2xl');
	let addingComment = $state(false);

	const publicConfig = $derived(
		data.publicConfig ?? {
			siteTitle: 'fermentario',
			description: SLOGAN,
			notesEnabled: true,
			showCoverImages: true,
			updatedAt: 0
		}
	);

	$effect(() => {
		note = data.note;
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

	const seoDesc = $derived(note.content.replace(/\s+/g, ' ').trim().slice(0, 160));
	const ogImage = $derived(
		publicConfig.showCoverImages && note.coverId
			? `${data.origin}/api/notes/photos/${note.coverId}`
			: note.video
				? `https://i.ytimg.com/vi/${note.video}/hqdefault.jpg`
				: null
	);

	async function addComment(text: string): Promise<boolean> {
		try {
			const res = await loading.track(fetch(`/api/notes/${note.id}/comments`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content: text })
			}));
			const d = await res.json();
			if (!res.ok) return false;
			comments = sortComments([d.comment as NoteComment, ...comments]);
			return true;
		} catch {
			showToast('Failed to add comment.');
			return false;
		}
	}
</script>

<svelte:head>
	<title>{note.title || note.content.slice(0, 40)} · {publicConfig.siteTitle}</title>
	<meta name="description" content={seoDesc} />
	<link rel="canonical" href="{data.origin}/notes/{note.id}" />
	<meta property="og:type" content="article" />
	<meta property="og:title" content="{note.title || note.content.slice(0, 60)} · {publicConfig.siteTitle}" />
	<meta property="og:description" content={seoDesc} />
	<meta property="og:url" content="{data.origin}/notes/{note.id}" />
	{#if ogImage}<meta property="og:image" content={ogImage} />{/if}
	<meta property="article:published_time" content={new Date(note.created_at).toISOString()} />
	{#if note.updated_at > note.created_at}<meta property="article:modified_time" content={new Date(note.updated_at).toISOString()} />{/if}
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content="{note.title || note.content.slice(0, 60)} · {publicConfig.siteTitle}" />
	<meta name="twitter:description" content={seoDesc} />
</svelte:head>

<main class="min-h-dvh">
	<div class="mx-auto {contentClass} px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-24">
		<PublicHeader siteTitle={publicConfig.siteTitle} />
		<header class="mb-5">
			<a href="/" class="inline-flex items-center gap-1 text-xs font-medium text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200">
				<ArrowLeft class="h-3.5 w-3.5" /> All published notes
			</a>
			<p class="mt-3 text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
				{new Date(note.created_at).toLocaleString(lang === 'es' ? 'es-ES' : lang === 'pt' ? 'pt-PT' : 'en-US', {
					weekday: 'long',
					day: 'numeric',
					month: 'long',
					year: 'numeric',
					hour: '2-digit',
					minute: '2-digit'
				})}
				{#if note.updated_at > note.created_at}· edited{/if}
			</p>
		</header>

		<article class="relative rounded-2xl border border-stone-200/80 dark:border-stone-800/80 bg-white/70 dark:bg-stone-900/70 px-4 py-3">
			<NoteBody
				{note}
				variant="page"
				publicUi
				showCover={publicConfig.showCoverImages}
				{lang}
			/>
		</article>

		<section class="mt-6" aria-label="Comments on this note">
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
					No comments yet.
				</p>
			{:else}
				<ul class="space-y-2">
					{#each comments as c (c.id)}
						<CommentItem
							id={c.id}
							content={c.content}
							date={new Date(c.created_at).toLocaleDateString(lang === 'es' ? 'es-ES' : lang === 'pt' ? 'pt-PT' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
							pinned={c.pinned}
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
