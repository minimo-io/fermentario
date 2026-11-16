<script lang="ts">
	import Weekly from '$lib/components/Weekly.svelte';
	import Timeline from '$lib/components/Timeline.svelte';
	import Copy from '@lucide/svelte/icons/copy';
	import CollapsibleSection from '$lib/components/CollapsibleSection.svelte';
	import Star from '@lucide/svelte/icons/star';
	import { getContext } from 'svelte';
	import { APP_KEY, type AppContext } from '$lib/app-context';

	// Notes live here. The header, market strip, composer and settings
	// stay in the app shell; this page only renders the notes column.
	const ctx = getContext<AppContext>(APP_KEY);
	const n = ctx.notes;
	const d = ctx.display;
</script>

{#if n.week && !n.dismissed}
	<section class="mt-5 mb-5">
		<Weekly summaryLoading={n.summaryLoading} week={n.week} reading={n.reading} onRead={n.onReadWeekly} onDismiss={n.onDismissWeekly} />
	</section>
{/if}

{#if n.featured.length > 0}
	<section class="mt-5 mb-5" aria-label="Featured notes">
		<CollapsibleSection label="Featured" storageKey="ferm:featured-collapsed">
			{#snippet icon()}
				<Star class="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Featured" />
			{/snippet}
			<Timeline
				notes={n.featured}
				summaryLoading={n.summaryLoading}
				onDelete={n.onDeleteNote}
				onEdit={n.onEditNote}
				onFeature={n.onFeatureNote}
				onPublish={n.onPublishNote}
				onCover={n.onCoverNote}
				onLoadMore={n.onLoadMore}
				hasMore={false}
				loadingMore={false}
				onRemoveTag={n.onRemoveTag}
				lang={d.lang}
			/>
		</CollapsibleSection>
	</section>
{/if}

<section>
	<div class="mb-2 flex items-center justify-between gap-2 px-1">
		<span class="text-[11px] tabular-nums text-stone-400 dark:text-stone-500">{n.notes.length} notes loaded</span>
		<button
			type="button"
			class="inline-flex items-center gap-1.5 rounded-full border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-1 text-[11px] font-medium text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-40"
			disabled={n.notes.length === 0}
			onclick={n.onCopyLoaded}
		><Copy class="h-3.5 w-3.5" /> {n.copied ? 'Copied' : 'Copy all'}</button>
	</div>
	<Timeline
		notes={n.notes}
		summaryLoading={n.summaryLoading}
		onDelete={n.onDeleteNote}
		onEdit={n.onEditNote}
		onFeature={n.onFeatureNote}
		onPublish={n.onPublishNote}
		onCover={n.onCoverNote}
		onLoadMore={n.onLoadMore}
		hasMore={n.hasMore}
		loadingMore={n.loadingMore}
		onRemoveTag={n.onRemoveTag}
		lang={d.lang}
	/>
</section>
