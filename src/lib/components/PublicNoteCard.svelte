<script lang="ts">
	import NoteLinkPills from '$lib/components/NoteLinkPills.svelte';
	import NoteCover from '$lib/components/NoteCover.svelte';
	import type { Note } from '$lib/types';

	// The public list is a blog list: title or excerpt, never the rendered
	// body. Only /notes/<id> renders the full note.
	type Props = { note: Note; showCover: boolean; locale: string };
	let { note, showCover, locale }: Props = $props();

	function excerpt(content: string, max = 160): string {
		const flat = content.replace(/\s+/g, ' ').trim();
		return flat.length <= max ? flat : `${flat.slice(0, max).trim()}…`;
	}
</script>

<div class="rounded-2xl border border-stone-200/80 dark:border-stone-800/80 bg-white/70 dark:bg-stone-900/70 px-4 py-3">
	{#if note.coverId && showCover}
		<NoteCover coverId={note.coverId} variant="public-row" />
	{/if}
	{#if note.title}
		<a
			href={`/notes/${note.id}`}
			class="block text-[15px] font-semibold leading-snug text-stone-900 hover:underline dark:text-stone-100"
		>{note.title}</a
		>
	{:else}
		<a
			href={`/notes/${note.id}`}
			class="block text-[15px] leading-snug text-stone-800 hover:underline dark:text-stone-200 {note.monospace ? 'font-mono' : ''}"
		>{excerpt(note.content)}</a
		>
	{/if}
	<p class="mt-1 text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
		{new Date(note.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}
		{#if (note.commentCount ?? 0) > 0} · {note.commentCount} comments{/if}
	</p>
	{#if (note.linkedNotes?.length ?? 0) > 0}
		<div class="mt-1.5">
			<NoteLinkPills links={note.linkedNotes ?? []} publicUi />
		</div>
	{/if}
</div>
