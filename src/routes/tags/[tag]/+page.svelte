<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import PublicNoteCard from '$lib/components/PublicNoteCard.svelte';
	import { contentWidthClass } from '$lib/display';
	import { dayLocale } from '$lib/dates';
	import { tagColors } from '$lib/tag-colors.svelte';
	import type { Note } from '$lib/types';

	// Same shape as the admin tag page, but published notes only: no to-dos,
	// principles, time entries or edit actions ever reach this page.
	let { data } = $props();
	// svelte-ignore state_referenced_locally
	let notes = $state<Note[]>(data.notes ?? []);
	// svelte-ignore state_referenced_locally
	let hasMore = $state(data.hasMore ?? false);
	// svelte-ignore state_referenced_locally
	let nextCursor = $state<{ created_at: number; id: string } | null>(data.nextCursor ?? null);
	let loadingMore = $state(false);
	let error = $state('');
	let contentClass = $state(contentWidthClass(undefined));
	const locale = dayLocale('en');

	onMount(() => {
		void tagColors.load();
		try {
			const raw = localStorage.getItem('fermentario.config');
			if (raw) contentClass = contentWidthClass((JSON.parse(raw) as { contentWidth?: string })?.contentWidth);
		} catch {}
	});

	async function loadMore() {
		if (loadingMore || !hasMore) return;
		loadingMore = true;
		try {
			const q = new URLSearchParams({ limit: '50', tag: data.tag });
			if (nextCursor) {
				q.set('before', String(nextCursor.created_at));
				q.set('before_id', nextCursor.id);
			}
			const res = await fetch(`/api/public/notes?${q.toString()}`);
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to load notes.');
			notes = [...notes, ...((d.notes as Note[]) ?? [])];
			hasMore = !!d.hasMore;
			nextCursor = (d.nextCursor as typeof nextCursor) ?? null;
		} catch (e) {
			error = (e as Error)?.message ?? 'Failed to load notes.';
		} finally {
			loadingMore = false;
		}
	}
</script>

<svelte:head>
	<title>#{data.tag} · {data.publicConfig?.siteTitle ?? 'fermentario'}</title>
</svelte:head>

<main class="min-h-dvh">
	<div class="mx-auto {contentClass} px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-24">
		<header class="mb-5">
			<button
				type="button"
				class="inline-flex items-center gap-1 text-xs font-medium text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200"
				onclick={() => { if (window.history.length > 1) window.history.back(); else void goto('/'); }}
			>
				<ArrowLeft class="h-3.5 w-3.5" /> All posts
			</button>
			<h1 class="mt-3 flex items-center gap-2 text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
				<span class="h-4 w-4 rounded-full {tagColors.dot(data.tag)}"></span>
				#{data.tag}
			</h1>
			<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">
				{data.count}
				{data.count === 1 ? 'published note' : 'published notes'} with this tag
			</p>
		</header>

		{#if data.count === 0}
			<p class="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 px-4 py-10 text-center text-sm text-stone-500 dark:text-stone-400">
				Nothing published with this tag.
			</p>
		{:else}
			<ul class="space-y-2">
				{#each notes as n (n.id)}
					<li><PublicNoteCard note={n} showCover={data.publicConfig?.showCoverImages ?? true} {locale} /></li>
				{/each}
			</ul>
			{#if error}
				<p class="mt-3 text-center text-sm text-rose-600 dark:text-rose-400">{error}</p>
			{/if}
			{#if hasMore}
				<div class="mt-4 flex justify-center">
					<button
						type="button"
						class="rounded-full border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-4 py-2 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-60"
						disabled={loadingMore}
						onclick={() => void loadMore()}
					>{loadingMore ? 'Loading…' : 'Load more'}</button>
				</div>
			{/if}
		{/if}
	</div>
</main>
