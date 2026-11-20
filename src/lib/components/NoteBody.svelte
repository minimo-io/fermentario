<script lang="ts">
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import TagChip from '$lib/components/TagChip.svelte';
	import VideoPill from '$lib/components/VideoPill.svelte';
	import NoteLinkPills from '$lib/components/NoteLinkPills.svelte';
	import { renderNoteContent } from '$lib/note-links';
	import { createNoteFold } from '$lib/note-fold.svelte';
	import type { Note } from '$lib/types';

	// ONE rendering of a note for the note rows and the two note pages: admin
	// list, admin note page, public note page. Fixed order everywhere:
	// cover -> title -> linked pills -> markdown body -> tags -> video.
	// The body folds the same way on every one of them.
	// `variant` only changes the title size and the cover cap.
	// The public index is NOT a body surface: it lists title or excerpt only.
	type Props = {
		note: Note;
		variant?: 'row' | 'page';
		publicUi?: boolean;
		showCover?: boolean;
		removableTags?: boolean;
		onRemoveTag?: (tag: string) => void;
		lang?: string;
	};
	let {
		note,
		variant = 'row',
		publicUi = false,
		showCover = true,
		removableTags = false,
		onRemoveTag
	}: Props = $props();

	const fold = createNoteFold();
	const html = $derived(renderNoteContent(note.content, note.linkedNotes, { publicUi }));
	const coverClass = $derived(variant === 'page' ? 'max-h-80' : 'max-h-40');
</script>

{#if note.coverId && showCover}
	<img
		src={`/api/notes/photos/${note.coverId}`}
		alt=""
		loading="lazy"
		class="mb-2 w-full rounded-xl object-cover {coverClass}"
	/>
{/if}

{#if note.title}
	{#if variant === 'page'}
		<h2 class="mb-1 text-lg font-semibold leading-snug text-stone-900 dark:text-stone-100">{note.title}</h2>
	{:else}
		<p class="mb-0.5 text-[15px] font-semibold leading-snug text-stone-900 dark:text-stone-100">{note.title}</p>
	{/if}
{/if}

{#if (note.linkedNotes?.length ?? 0) > 0}
	<div class="mb-1.5"><NoteLinkPills links={note.linkedNotes ?? []} {publicUi} /></div>
{/if}

{#if fold.collapsed[note.id] || fold.foldable[note.id]}
	<div
		bind:this={fold.foldEls[note.id]}
		class="transition-[max-height] duration-[180ms] ease-out motion-reduce:transition-none {fold.maxHeights[note.id] !== undefined || fold.collapsed[note.id]
			? 'overflow-hidden'
			: ''}"
		style:max-height={fold.maxHeights[note.id]}
		ontransitionend={(e) => fold.finishFold(note.id, e)}
	>
		<!-- The fold lives on a small chevron, never on the text: the body
		must stay selectable and copyable everywhere. The chevron stays under
		one text line so the one-line max-height cap never clips it. -->
		<div class="flex items-start">
			<button
				type="button"
				class="-ml-1 mt-px grid h-5 w-5 shrink-0 place-items-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-300"
				aria-label={fold.collapsed[note.id] ? 'Expand note' : 'Collapse note'}
				aria-expanded={fold.collapsed[note.id] ? 'false' : 'true'}
				onclick={() => void fold.toggle(note.id)}
			>
				<ChevronDown
					class="h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none {fold.collapsed[note.id]
						? '-rotate-90'
						: ''}"
				/>
			</button>
			<div
				bind:this={fold.textEls[note.id]}
				class="min-w-0 flex-1 whitespace-pre-wrap text-[15px] leading-snug text-stone-800 dark:text-stone-200 {fold.collapsed[
					note.id
				] && !fold.unclamped[note.id]
					? 'line-clamp-1'
					: ''}"
			>
				{@html html}
			</div>
		</div>
	</div>
{:else}
	<p
		bind:this={fold.textEls[note.id]}
		class="whitespace-pre-wrap text-[15px] leading-snug text-stone-800 dark:text-stone-200">{@html html}</p
	>
{/if}

{#if note.tags?.length}
	<div class="mt-2 flex flex-wrap gap-1">
		{#each note.tags as tag (tag)}
			{#if removableTags && onRemoveTag}
				<TagChip {tag} picker={!publicUi} onRemove={(t) => onRemoveTag(t)} />
			{:else}
				<TagChip {tag} picker={!publicUi} />
			{/if}
		{/each}
	</div>
{/if}

{#if note.video}
	<div class="mt-2"><VideoPill id={note.video} /></div>
{/if}
