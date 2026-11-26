<script lang="ts">
	import { tick } from 'svelte';
	import { fade } from 'svelte/transition';
	import { newNote } from '$lib/new-note.svelte';
	import { datetimeLocalTimestamp, datetimeLocalValue } from '$lib/datetime';
	import { splitHashtags } from '$lib/hashtags';
	import TagFinder from '$lib/components/TagFinder.svelte';
	import NoteFinder from '$lib/components/NoteFinder.svelte';
	import CalendarClock from '@lucide/svelte/icons/calendar-clock';
	import X from '@lucide/svelte/icons/x';

	let textarea = $state<HTMLTextAreaElement | null>(null);
	const pendingTags = $derived(splitHashtags(newNote.text).tags);
	const canSave = $derived(splitHashtags(newNote.text).content.trim().length > 0 && !newNote.saving);
	let maxDate = $state('');
	let dateValue = $state('');

	$effect(() => {
		if (!newNote.open) return;
		maxDate = datetimeLocalValue(Date.now());
		dateValue = newNote.createdAt === null ? '' : datetimeLocalValue(newNote.createdAt);
		void tick().then(() => {
			textarea?.focus();
			textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
		});
	});

	function setDate(value: string) {
		dateValue = value;
		newNote.setCreatedAt(value ? datetimeLocalTimestamp(value) ?? null : null);
	}

	function onKeydown(e: KeyboardEvent) {
		if (!newNote.open || e.isComposing) return;
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			void newNote.save();
		} else if (e.key === 'Escape') {
			newNote.close();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

{#if newNote.open}
	<div
		class="fixed inset-0 z-50 flex flex-col bg-white dark:bg-stone-900"
		role="dialog"
		aria-modal="true"
		aria-label="New note"
		tabindex="-1"
		transition:fade={{ duration: 150 }}
	>
		<div class="mx-auto flex w-full max-w-2xl items-center justify-between gap-2 px-6 pt-6">
			<button type="button" class="inline-flex items-center gap-2 rounded-full border border-stone-300 px-4 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800" onclick={() => newNote.close()}>
				<X class="h-3.5 w-3.5" /> Close
			</button>
			<button type="button" class="rounded-full bg-stone-900 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-stone-700" onclick={() => void newNote.save()} disabled={!canSave}>
				{newNote.saving ? 'Saving…' : 'Save'}
			</button>
		</div>
		<div class="mx-auto mt-3 flex w-full max-w-2xl flex-wrap items-center gap-2 px-6">
			<label class="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] text-stone-500 dark:border-stone-800 dark:bg-stone-800/50 dark:text-stone-400">
				<CalendarClock class="h-3.5 w-3.5 shrink-0" />
				<span class="shrink-0">Date</span>
				<input type="datetime-local" value={dateValue} max={maxDate} aria-label="Note date and time" title="Leave empty to use the current time" class="min-w-0 max-w-[11rem] bg-transparent text-base text-stone-600 outline-none dark:text-stone-300" oninput={(e) => setDate(e.currentTarget.value)} />
			</label>
			<span class="text-[11px] text-stone-400">Empty uses now.</span>
		</div>
		{#if pendingTags.length > 0}
			<div class="mx-auto mt-3 flex w-full max-w-2xl flex-wrap items-center gap-1 px-6">
				{#each pendingTags as tag (tag)}
					<span class="rounded-full border border-dashed border-stone-300 bg-white px-2 py-0.5 text-[11px] text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400">#{tag}</span>
				{/each}
			</div>
		{/if}
		{#if newNote.error}<p class="mx-auto mt-2 w-full max-w-2xl px-6 text-xs text-rose-500" role="alert">{newNote.error}</p>{/if}
		<div class="relative mx-auto flex w-full max-w-2xl flex-1 px-6 pb-6 pt-3">
			<textarea
				bind:this={textarea}
				class="h-full w-full resize-none bg-transparent text-base leading-relaxed text-stone-800 outline-none dark:text-stone-200"
				value={newNote.text}
				oninput={(e) => newNote.setText(e.currentTarget.value)}
				placeholder="Write a note. Use #tags and [[note links]]."
				aria-label="Note text"
			></textarea>
			<NoteFinder {textarea} />
			<TagFinder {textarea} />
		</div>
	</div>
{/if}
