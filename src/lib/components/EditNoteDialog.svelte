<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import Maximize2 from '@lucide/svelte/icons/maximize-2';
	import Minimize2 from '@lucide/svelte/icons/minimize-2';
	import { splitHashtags, withTrailingHashtags } from '$lib/hashtags';
	import { datetimeLocalTimestamp, datetimeLocalValue } from '$lib/datetime';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import { youTubeWatchUrl } from '$lib/youtube';
	import { fileToPhotoUrl } from '$lib/stock-photo';
	import NoteFinder from '$lib/components/NoteFinder.svelte';
	import TagFinder from '$lib/components/TagFinder.svelte';
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
	let err = $state('');
	let full = $state(false);
	let editField = $state<HTMLTextAreaElement | null>(null);
	let finder = $state<{ handleKey: (e: KeyboardEvent) => boolean } | null>(null);
	let tagFinder = $state<{ handleKey: (e: KeyboardEvent) => boolean } | null>(null);
	// Cover state: undefined keeps the stored cover, a data URL replaces it,
	// null removes it. The client downsizes to JPEG before upload.
	// svelte-ignore state_referenced_locally
	let coverPreview = $state<string | null>(coverId ? `/api/notes/photos/${coverId}` : null);
	let coverData = $state<string | null | undefined>(undefined);
	// svelte-ignore state_referenced_locally
	let noteDate = $state(datetimeLocalValue(note.created_at));
	const maxNoteDate = datetimeLocalValue(Date.now());

	const originalDate = $derived(datetimeLocalValue(note.created_at));
	const unchanged = $derived(title.trim() === (note.title ?? '').trim() && content.trim() === withTrailingHashtags(note.content, note.tags).trim() && video.trim() === (note.video ? youTubeWatchUrl(note.video) : '') && noteDate === originalDate && coverData === undefined);
	const empty = $derived(splitHashtags(content).content.trim().length === 0);

	async function pickCover(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		try {
			coverData = await fileToPhotoUrl(file);
			coverPreview = coverData;
		} catch {
			err = 'Could not read the image.';
		}
	}

	function removeCover() {
		coverData = null;
		coverPreview = null;
	}

	async function save() {
		if (saving || empty || unchanged) return;
		saving = true;
		err = '';
		try {
			const at = noteDate === originalDate
				? note.created_at
				: Math.min(datetimeLocalTimestamp(noteDate) ?? Date.now(), Date.now());
			await onSave(content.trim(), video.trim(), at, coverData, title.trim());
		} catch (e) {
			err = (e as Error)?.message ?? 'Could not save the note.';
		} finally {
			saving = false;
		}
	}
</script>

<div
	class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 dark:bg-black/60 backdrop-blur-md transition-[padding] duration-200 ease-out motion-reduce:transition-none {full ? 'p-0' : 'p-4'}"
	role="dialog"
	aria-modal="true"
	aria-labelledby="edit-title"
	tabindex="-1"
	onclick={(e) => { if (e.target === e.currentTarget && !saving) onCancel(); }}
	onkeydown={(e) => {
		if (e.isComposing) return;
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			if (e.defaultPrevented) return;
			e.preventDefault();
			void save();
			return;
		}
		if (e.key !== 'Escape' || saving) return;
		if (full) full = false;
		else onCancel();
	}}
	transition:fade={{ duration: motionMs(BACKDROP_MS) }}
>
	<div
		class="w-full bg-white dark:bg-stone-900 p-5 shadow-xl [interpolate-size:allow-keywords] transition-[height,max-width,border-radius] duration-200 ease-out motion-reduce:transition-none {full ? 'flex h-dvh max-w-full flex-col rounded-none' : 'h-auto max-h-[calc(100dvh-2rem)] max-w-md overflow-y-auto rounded-2xl'}"
		transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}
	>
		<div class={full ? 'mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col' : ''}>
			<div class="flex items-start justify-between gap-2">
				<h2 id="edit-title" class="text-sm font-semibold text-stone-900 dark:text-stone-100">Edit note</h2>
				<div class="-mr-1 -mt-1 flex shrink-0 items-center gap-0.5">
					<button
						type="button"
						class="grid h-8 w-8 place-items-center rounded-full text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300"
						aria-label={full ? 'Exit full screen' : 'Full screen'}
						aria-pressed={full}
						title={full ? 'Exit full screen' : 'Full screen'}
						onclick={() => (full = !full)}
					>
						{#if full}<Minimize2 class="h-4 w-4" />{:else}<Maximize2 class="h-4 w-4" />{/if}
					</button>
					<button
						type="button"
						class="grid h-8 w-8 place-items-center rounded-full text-lg leading-none text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300"
						aria-label="Close"
						onclick={onCancel}
					>&times;</button>
				</div>
			</div>
			<label class="mt-3 block text-xs font-medium text-stone-500 dark:text-stone-400" for="edit-note-title">Title (optional)</label>
			<input
				id="edit-note-title"
				class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base text-stone-800 dark:text-stone-200 outline-none focus:border-stone-400 dark:focus:border-stone-600"
				value={title}
				oninput={(e) => onTitle(e.currentTarget.value)}
				maxlength={120}
			/>
			<div class={full ? 'relative flex min-h-0 flex-1 flex-col' : 'relative'}>
				<textarea
					bind:this={editField}
					class="mt-3 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base leading-snug text-stone-800 dark:text-stone-200 outline-none focus:border-stone-400 dark:focus:border-stone-600 {full ? 'min-h-0 flex-1 resize-none' : 'max-h-[50dvh] min-h-32 resize-y'}"
					value={content}
					oninput={(e) => onContent(e.currentTarget.value)}
					onkeydown={(e) => { tagFinder?.handleKey(e); finder?.handleKey(e); }}
					placeholder="Note text"
				></textarea>
				<NoteFinder bind:this={finder} textarea={editField} excludeId={note.id} />
				<TagFinder bind:this={tagFinder} textarea={editField} />
			</div>
			<label class="mt-3 block text-xs font-medium text-stone-500 dark:text-stone-400" for="edit-note-date">Date and time</label>
			<input
				id="edit-note-date"
				type="datetime-local"
				class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base text-stone-800 dark:text-stone-200 outline-none focus:border-stone-400 dark:focus:border-stone-600"
				bind:value={noteDate}
				max={maxNoteDate}
			/>
			<p class="mt-1 text-[11px] text-stone-400 dark:text-stone-500">Empty uses the current time.</p>
			<label class="mt-3 block text-xs font-medium text-stone-500 dark:text-stone-400" for="edit-video">YouTube URL (optional)</label>
			<input
				id="edit-video"
				class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-base text-stone-800 dark:text-stone-200 outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-stone-400 dark:focus:border-stone-600"
				value={video}
				oninput={(e) => onVideo(e.currentTarget.value)}
				placeholder="https://www.youtube.com/watch?v=…"
				inputmode="url"
			/>
			<div class="mt-3">
				<span class="block text-xs font-medium text-stone-500 dark:text-stone-400">Cover image (optional)</span>
				{#if coverPreview}
					<div class="mt-1 flex items-start gap-2">
						<img src={coverPreview} alt="Note cover preview" class="h-20 w-32 rounded-xl object-cover" />
						<button
							type="button"
							class="grid h-7 w-7 shrink-0 place-items-center rounded-full text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-rose-600 dark:hover:text-rose-400"
							aria-label="Remove cover image"
							onclick={removeCover}
						><X class="h-4 w-4" /></button>
					</div>
				{:else}
					<label class="mt-1 inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-stone-200 dark:border-stone-800 px-3 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800">
						<ImagePlus class="h-3.5 w-3.5" /> Choose image
						<input type="file" accept="image/*" class="sr-only" onchange={pickCover} />
					</label>
				{/if}
			</div>
			{#if err}
				<p class="mt-2 text-xs text-rose-500 dark:text-rose-400">{err}</p>
			{/if}
			<div class="mt-4 flex justify-end gap-2">
				<button
					type="button"
					class="rounded-full border border-stone-200 dark:border-stone-800 px-4 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-50"
					disabled={saving}
					onclick={onCancel}
				>{saving ? 'Saving…' : 'Cancel'}</button>
				<button
					type="button"
					class="rounded-full bg-stone-900 dark:bg-stone-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-stone-800 dark:hover:bg-stone-600 disabled:opacity-50"
					disabled={saving || empty || unchanged}
					onclick={save}
				>{saving ? 'Saving…' : 'Save'}</button>
			</div>
		</div>
	</div>
</div>