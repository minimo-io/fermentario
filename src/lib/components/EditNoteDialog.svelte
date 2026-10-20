<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import Maximize2 from '@lucide/svelte/icons/maximize-2';
	import Minimize2 from '@lucide/svelte/icons/minimize-2';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import { youTubeWatchUrl } from '$lib/youtube';
	import type { Note } from '$lib/types';

	type Props = {
		note: Note;
		content: string;
		video: string;
		onContent: (value: string) => void;
		onVideo: (value: string) => void;
		onSave: (content: string, video: string) => Promise<void>;
		onCancel: () => void;
	};
	let { note, content, video, onContent, onVideo, onSave, onCancel }: Props = $props();

	let saving = $state(false);
	let err = $state('');
	let full = $state(false);

	const unchanged = $derived(content.trim() === note.content.trim() && video.trim() === (note.video ? youTubeWatchUrl(note.video) : ''));
	const empty = $derived(content.trim().length === 0);

	async function save() {
		if (saving || empty || unchanged) return;
		saving = true;
		err = '';
		try {
			await onSave(content.trim(), video.trim());
		} catch (e) {
			err = (e as Error)?.message ?? 'Could not save the note.';
		} finally {
			saving = false;
		}
	}
</script>

<div
	class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 dark:bg-black/60 transition-[padding] duration-200 ease-out motion-reduce:transition-none {full ? 'p-0' : 'p-4'}"
	role="dialog"
	aria-modal="true"
	aria-labelledby="edit-title"
	tabindex="-1"
	onclick={(e) => { if (e.target === e.currentTarget && !saving) onCancel(); }}
	onkeydown={(e) => {
		if (e.key !== 'Escape' || saving) return;
		if (full) full = false;
		else onCancel();
	}}
	transition:fade={{ duration: motionMs(BACKDROP_MS) }}
>
	<div
		class="w-full bg-white dark:bg-stone-900 p-5 shadow-xl [interpolate-size:allow-keywords] transition-[height,max-width,border-radius] duration-200 ease-out motion-reduce:transition-none {full ? 'flex h-dvh max-w-full flex-col rounded-none' : 'h-auto max-w-md rounded-2xl'}"
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
			<textarea
				class="mt-3 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-[15px] leading-snug text-stone-800 dark:text-stone-200 outline-none focus:border-stone-400 dark:focus:border-stone-600 {full ? 'min-h-0 flex-1 resize-none' : 'max-h-[50dvh] min-h-32 resize-y'}"
				value={content}
				oninput={(e) => onContent(e.currentTarget.value)}
				placeholder="Note text"
			></textarea>
			<label class="mt-3 block text-xs font-medium text-stone-500 dark:text-stone-400" for="edit-video">YouTube URL (optional)</label>
			<input
				id="edit-video"
				class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-sm text-stone-800 dark:text-stone-200 outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-stone-400 dark:focus:border-stone-600"
				value={video}
				oninput={(e) => onVideo(e.currentTarget.value)}
				placeholder="https://www.youtube.com/watch?v=…"
				inputmode="url"
			/>
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