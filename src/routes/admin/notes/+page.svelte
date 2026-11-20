<script lang="ts">
	import Weekly from '$lib/components/Weekly.svelte';
	import Timeline from '$lib/components/Timeline.svelte';
	import Check from '@lucide/svelte/icons/check';
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
		<span class="flex items-center gap-2">
			<span class="text-[11px] tabular-nums text-stone-400 dark:text-stone-500">{n.notes.length} notes loaded</span>
			<button
				type="button"
				class="inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors {n.publishedOnly
					? 'border-emerald-600 bg-emerald-600 text-white shadow-sm hover:bg-emerald-700 dark:border-emerald-500 dark:bg-emerald-500 dark:text-emerald-950 dark:hover:bg-emerald-400'
					: 'border-emerald-300 bg-white text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:bg-stone-900 dark:text-emerald-300 dark:hover:bg-emerald-950/40'}"
				aria-pressed={n.publishedOnly}
				title={n.publishedOnly ? 'Showing published notes only — click to show all' : 'Show published notes only'}
				onclick={n.onTogglePublished}
			>
				{#if n.publishedOnly}<Check class="h-3 w-3" />{/if}
				Published
			</button>
		</span>
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
