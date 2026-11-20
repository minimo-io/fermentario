<script lang="ts">
	import { tick } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import { newNote } from '$lib/new-note.svelte';
	import { splitHashtags } from '$lib/hashtags';
	import TagFinder from '$lib/components/TagFinder.svelte';

	let textarea = $state<HTMLTextAreaElement | null>(null);

	const parsed = $derived(splitHashtags(newNote.text));
	const pendingTags = $derived(parsed.tags);
	const empty = $derived(parsed.content.trim().length === 0);
	const canSave = $derived(!empty && !newNote.saving);

	$effect(() => {
		if (!newNote.open) return;
		void tick().then(() => {
			textarea?.focus();
			textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
		});
	});

	function onKeydown(e: KeyboardEvent) {
		if (!newNote.open || e.isComposing) return;
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			void newNote.save();
			return;
		}
		if (e.key === 'Escape') newNote.close();
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if newNote.open}
	<div
		class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 p-4 backdrop-blur-md dark:bg-black/60"
		role="dialog"
		aria-modal="true"
		aria-labelledby="new-note-title"
		tabindex="-1"
		onclick={(e) => {
			if (e.target === e.currentTarget) newNote.close();
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape' && !e.isComposing) newNote.close();
		}}
		transition:fade={{ duration: motionMs(BACKDROP_MS) }}
	>
		<div
			class="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-stone-900"
			transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}
		>
			<div class="flex items-start justify-between gap-2">
				<h2 id="new-note-title" class="text-sm font-semibold text-stone-900 dark:text-stone-100">New note</h2>
				<button
					type="button"
					class="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg leading-none text-stone-400 hover:bg-stone-100 hover:text-stone-600 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-300"
					aria-label="Close"
					onclick={() => newNote.close()}
				>&times;</button>
			</div>

			<div class="relative mt-3">
				<textarea
					bind:this={textarea}
					class="min-h-40 w-full resize-y rounded-xl border border-stone-200 bg-white p-3 text-base leading-snug text-stone-800 outline-none focus:border-stone-400 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-200 dark:focus:border-stone-600"
					value={newNote.text}
					oninput={(e) => (newNote.text = e.currentTarget.value)}
					placeholder="Write a note. Put #tags anywhere."
					aria-label="Note text"
				></textarea>
				<TagFinder {textarea} inline />
			</div>

			{#if pendingTags.length > 0}
				<div class="mt-2 flex flex-wrap items-center gap-1">
					{#each pendingTags as tag (tag)}
						<span class="rounded-full border border-dashed border-stone-300 bg-white/80 px-2 py-0.5 text-[11px] text-stone-500 dark:border-stone-700 dark:bg-stone-900/80 dark:text-stone-400">#{tag}</span>
					{/each}
				</div>
			{/if}

			{#if newNote.error}
				<p class="mt-2 text-xs text-rose-500 dark:text-rose-400">{newNote.error}</p>
			{/if}

			<div class="mt-4 flex items-center justify-between gap-2">
				<p class="text-[11px] text-stone-400 dark:text-stone-500">Saves to the journal, from any page.</p>
				<div class="flex shrink-0 gap-2">
					<button
						type="button"
						class="rounded-full border border-stone-200 px-4 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-50 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-800"
						disabled={newNote.saving}
						onclick={() => newNote.close()}
					>Cancel</button>
					<button
						type="button"
						class="rounded-full bg-stone-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-700 dark:hover:bg-stone-600"
						disabled={!canSave}
						onclick={() => void newNote.save()}
					>{newNote.saving ? 'Saving…' : 'Save note'}</button>
				</div>
			</div>
		</div>
	</div>
{/if}
