<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { fade, slide } from 'svelte/transition';
	import { BACKDROP_MS, motionMs } from '$lib/motion';
	import { datetimeLocalTimestamp, datetimeLocalValue } from '$lib/datetime';
	import { splitHashtags, withTrailingHashtags } from '$lib/hashtags';
	import { youTubeWatchUrl } from '$lib/youtube';
	import { fileToPhotoUrl } from '$lib/stock-photo';
	import NoteFinder from '$lib/components/NoteFinder.svelte';
	import TagFinder from '$lib/components/TagFinder.svelte';
	import CalendarClock from '@lucide/svelte/icons/calendar-clock';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import ImagePlus from '@lucide/svelte/icons/image-plus';
	import X from '@lucide/svelte/icons/x';
	import type { Note } from '$lib/types';

	type Props = {
		note: Note;
		title: string;
		content: string;
		video: string;
		coverId: string | null;
		onTitle: (value: string) => void;
		onContent: (value: string) => void;
		onVideo: (value: string) => void;
		onSave: (content: string, video: string, createdAt: number, cover: string | null | undefined, title: string) => Promise<void>;
		onCancel: () => void;
	};
	let { note, title, content, video, coverId, onTitle, onContent, onVideo, onSave, onCancel }: Props = $props();

	let saving = $state(false);
	let error = $state('');
	let textarea = $state<HTMLTextAreaElement | null>(null);
	let mobile = $state(true);
	let detailsOpen = $state(false);
	// svelte-ignore state_referenced_locally
	let dateValue = $state(datetimeLocalValue(note.created_at));
	let maxDate = $state(datetimeLocalValue(Date.now()));
	// svelte-ignore state_referenced_locally
	let coverPreview = $state<string | null>(coverId ? `/api/notes/photos/${coverId}` : null);
	let coverData = $state<string | null | undefined>(undefined);
	const pendingTags = $derived(splitHashtags(content).tags);
	const empty = $derived(splitHashtags(content).content.trim().length === 0);
	const originalDate = $derived(datetimeLocalValue(note.created_at));
	const unchanged = $derived(
		title.trim() === (note.title ?? '').trim() &&
		content.trim() === withTrailingHashtags(note.content, note.tags).trim() &&
		video.trim() === (note.video ? youTubeWatchUrl(note.video) : '') &&
		dateValue === originalDate &&
		coverData === undefined
	);

	onMount(() => {
		const query = window.matchMedia('(min-width: 640px)');
		const update = () => {
			mobile = !query.matches;
			detailsOpen = query.matches;
		};
		update();
		query.addEventListener('change', update);
		return () => query.removeEventListener('change', update);
	});

	$effect(() => {
		maxDate = datetimeLocalValue(Date.now());
		void tick().then(() => {
			textarea?.focus();
			textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
		});
	});

	async function pickCover(event: Event) {
		const input = event.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		try {
			coverData = await fileToPhotoUrl(file);
			coverPreview = coverData;
			error = '';
		} catch {
			error = 'Could not read the image.';
		}
	}

	function toggleDetails() {
		detailsOpen = !detailsOpen;
		if (!mobile) return;
		if (detailsOpen) {
			textarea?.blur();
		} else {
			void tick().then(() => textarea?.focus());
		}
	}

	function removeCover() {
		coverData = null;
		coverPreview = null;
	}

	async function save() {
		if (saving || empty || unchanged) return;
		saving = true;
		error = '';
		try {
			const createdAt = dateValue === originalDate
				? note.created_at
				: Math.min(datetimeLocalTimestamp(dateValue) ?? Date.now(), Date.now());
			await onSave(content.trim(), video.trim(), createdAt, coverData, title.trim());
		} catch (cause) {
			error = (cause as Error)?.message ?? 'Could not save the note.';
		} finally {
			saving = false;
		}
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.isComposing) return;
		if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
			event.preventDefault();
			void save();
		} else if (event.key === 'Escape' && !saving) {
			onCancel();
		}
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div
	class="fixed inset-0 z-50 flex h-dvh min-h-0 flex-col bg-white dark:bg-stone-900"
	role="dialog"
	aria-modal="true"
	aria-label="Edit note"
	tabindex="-1"
	transition:fade={{ duration: motionMs(BACKDROP_MS) }}
>
	<div class="mx-auto flex w-full max-w-2xl items-center justify-between gap-2 px-6 pt-6">
		<button
			type="button"
			class="inline-flex min-h-10 items-center gap-2 rounded-full border border-stone-300 px-4 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
			onclick={onCancel}
			disabled={saving}
		><X class="h-3.5 w-3.5" /> Close</button>
		<button
			type="button"
			class="min-h-10 rounded-full bg-stone-900 px-4 py-1.5 text-xs font-medium text-white disabled:opacity-50 dark:bg-stone-700"
			onclick={() => void save()}
			disabled={saving || empty || unchanged}
		>{saving ? 'Saving…' : 'Save'}</button>
	</div>

	<button
		type="button"
		class="mx-auto mt-3 flex min-h-10 w-full max-w-2xl items-center justify-between px-6 text-xs font-medium text-stone-500 dark:text-stone-400"
		aria-expanded={detailsOpen}
		onclick={toggleDetails}
	>
		<span>{detailsOpen ? 'Hide details' : 'Title, date, video and cover'}</span>
		<ChevronDown class="h-4 w-4 transition-transform duration-200 motion-reduce:transition-none {detailsOpen ? 'rotate-180' : ''}" />
	</button>

	{#if detailsOpen}
		<div class="min-h-0 shrink-0 overflow-y-auto" transition:slide={{ duration: motionMs(180) }}>
			<div class="mx-auto flex w-full max-w-2xl flex-wrap items-center gap-2 px-6">
		<input
			class="min-w-0 flex-1 basis-48 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-base text-stone-800 outline-none focus:border-stone-400 dark:border-stone-800 dark:bg-stone-800/50 dark:text-stone-200 dark:focus:border-stone-600"
			aria-label="Note title"
			placeholder="Title (optional)"
			value={title}
			oninput={(event) => onTitle(event.currentTarget.value)}
			maxlength={120}
		/>
		<label class="inline-flex min-w-0 items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] text-stone-500 dark:border-stone-800 dark:bg-stone-800/50 dark:text-stone-400">
			<CalendarClock class="h-3.5 w-3.5 shrink-0" />
			<span class="shrink-0">Date</span>
			<input
				type="datetime-local"
				value={dateValue}
				max={maxDate}
				aria-label="Note date and time"
				title="Leave empty to use the current time"
				class="min-w-0 max-w-[11rem] bg-transparent text-base text-stone-600 outline-none dark:text-stone-300"
				oninput={(event) => (dateValue = event.currentTarget.value)}
			/>
		</label>
			</div>

			<div class="mx-auto mt-2 flex w-full max-w-2xl flex-wrap items-center gap-2 px-6">
		<input
			class="min-w-0 flex-1 basis-48 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-base text-stone-700 outline-none placeholder:text-stone-400 focus:border-stone-400 dark:border-stone-800 dark:bg-stone-800/50 dark:text-stone-300 dark:focus:border-stone-600"
			aria-label="YouTube URL"
			placeholder="YouTube URL (optional)"
			value={video}
			oninput={(event) => onVideo(event.currentTarget.value)}
			inputmode="url"
		/>
		{#if coverPreview}
			<div class="flex items-center gap-2">
				<img src={coverPreview} alt="Note cover preview" class="h-10 w-16 rounded-lg object-cover" />
				<button
					type="button"
					class="grid h-9 w-9 place-items-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-rose-600 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-rose-400"
					aria-label="Remove cover image"
					onclick={removeCover}
				><X class="h-4 w-4" /></button>
			</div>
		{:else}
			<label class="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-full border border-stone-200 px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 dark:border-stone-800 dark:text-stone-300 dark:hover:bg-stone-800">
				<ImagePlus class="h-3.5 w-3.5" /> Cover
				<input type="file" accept="image/*" class="sr-only" onchange={pickCover} />
			</label>
		{/if}
			</div>

			{#if pendingTags.length > 0}
				<div class="mx-auto mt-2 flex w-full max-w-2xl flex-wrap items-center gap-1 px-6">
					{#each pendingTags as tag (tag)}
						<span class="rounded-full border border-dashed border-stone-300 bg-white px-2 py-0.5 text-[11px] text-stone-500 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400">#{tag}</span>
					{/each}
				</div>
			{/if}
		</div>
	{/if}
	{#if error}
		<p class="mx-auto mt-2 w-full max-w-2xl px-6 text-xs text-rose-500 dark:text-rose-400" role="alert">{error}</p>
	{/if}
	<div class="relative mx-auto flex min-h-0 w-full max-w-2xl flex-1 px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-3">
		<textarea
			bind:this={textarea}
			class="h-full w-full resize-none bg-transparent text-base leading-relaxed text-stone-800 outline-none dark:text-stone-200"
			value={content}
			oninput={(event) => onContent(event.currentTarget.value)}
			placeholder="Write a note. Use #tags and [[note links]]."
			aria-label="Note text"
		></textarea>
		<NoteFinder {textarea} excludeId={note.id} />
		<TagFinder {textarea} />
	</div>
</div>
