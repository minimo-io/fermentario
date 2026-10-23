<script lang="ts">
	import { onMount } from 'svelte';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import { contentWidthClass } from '$lib/display';
	import { tagColors } from '$lib/tag-colors.svelte';
	import type { TagCount } from '$lib/tag-cloud';

	type Props = { data: { tags: TagCount[]; error: boolean } };
	let { data }: Props = $props();

	let contentClass = $state('max-w-2xl');

	onMount(() => {
		void tagColors.load();
		try {
			const raw = localStorage.getItem('fermentario.config');
			if (raw) {
				const c = JSON.parse(raw) as { contentWidth?: string };
				contentClass = contentWidthClass(c?.contentWidth);
			}
		} catch {}
	});

	function breakdown(t: TagCount): string {
		const parts: string[] = [];
		if (t.notes > 0) parts.push(`${t.notes} ${t.notes === 1 ? 'note' : 'notes'}`);
		if (t.todos > 0) parts.push(`${t.todos} ${t.todos === 1 ? 'to-do' : 'to-dos'}`);
		if (t.principles > 0) parts.push(`${t.principles} ${t.principles === 1 ? 'principle' : 'principles'}`);
		return parts.join(' · ');
	}
</script>

<svelte:head>
	<title>Tags · fermentario</title>
</svelte:head>

<main class="min-h-dvh">
	<div class="mx-auto {contentClass} px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-24">
		<header class="mb-5">
			<a href="/" class="inline-flex items-center gap-1 text-xs font-medium text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200">
				<ArrowLeft class="h-3.5 w-3.5" /> All notes
			</a>
			<h1 class="mt-3 text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">Tags</h1>
			{#if !data.error && data.tags.length > 0}
				<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">
					{data.tags.length}
					{data.tags.length === 1 ? 'tag' : 'tags'} across notes, to-dos and principles.
				</p>
			{/if}
		</header>

		{#if data.error}
			<p class="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 px-4 py-6 text-center text-sm text-stone-500 dark:text-stone-400">
				Could not load tags. Reload the page to try again.
			</p>
		{:else if data.tags.length === 0}
			<p class="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 px-4 py-6 text-center text-sm text-stone-500 dark:text-stone-400">
				No tags yet. Add a #hashtag to a note, to-do or principle.
			</p>
		{:else}
			<nav class="flex flex-wrap items-center gap-2" aria-label="Tag cloud">
				{#each data.tags as t (t.tag)}
					<a
						href="/tags/{encodeURIComponent(t.tag)}"
						class="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium leading-tight transition-colors {tagColors.chip(t.tag)}"
						title={breakdown(t)}
						aria-label="#{t.tag}: {breakdown(t)}"
					>
						#{t.tag}
						<span class="text-[10px] tabular-nums opacity-70" aria-hidden="true">{t.count}</span>
					</a>
				{/each}
			</nav>
		{/if}
	</div>
</main>
