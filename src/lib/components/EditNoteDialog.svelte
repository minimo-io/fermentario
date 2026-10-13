<script lang="ts">
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

	const unchanged = $derived(content.trim() === note.content.trim() && video.trim() === (note.video ?? ''));
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
	class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 p-4"
	role="dialog"
	aria-modal="true"
	aria-labelledby="edit-title"
	tabindex="-1"
	onclick={(e) => { if (e.target === e.currentTarget && !saving) onCancel(); }}
	onkeydown={(e) => { if (e.key === 'Escape' && !saving) onCancel(); }}
>
	<div class="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
		<h2 id="edit-title" class="text-sm font-semibold text-stone-900">Edit note</h2>
		<textarea
			class="mt-3 max-h-[50dvh] min-h-32 w-full resize-y rounded-xl border border-stone-200 bg-white p-3 text-[15px] leading-snug text-stone-800 outline-none focus:border-stone-400"
			value={content}
			oninput={(e) => onContent(e.currentTarget.value)}
			placeholder="Note text"
		></textarea>
		<label class="mt-3 block text-xs font-medium text-stone-500" for="edit-video">YouTube URL (optional)</label>
		<input
			id="edit-video"
			class="mt-1 w-full rounded-xl border border-stone-200 bg-white p-3 text-sm text-stone-800 outline-none placeholder:text-stone-400 focus:border-stone-400"
			value={video}
			oninput={(e) => onVideo(e.currentTarget.value)}
			placeholder="https://www.youtube.com/watch?v=…"
			inputmode="url"
		/>
		{#if err}
			<p class="mt-2 text-xs text-rose-500">{err}</p>
		{/if}
		<div class="mt-4 flex justify-end gap-2">
			<button
				type="button"
				class="rounded-full border border-stone-200 px-4 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-50"
				disabled={saving}
				onclick={onCancel}
			>{saving ? 'Saving…' : 'Cancel'}</button>
			<button
				type="button"
				class="rounded-full bg-stone-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-stone-800 disabled:opacity-50"
				disabled={saving || empty || unchanged}
				onclick={save}
			>{saving ? 'Saving…' : 'Save'}</button>
		</div>
	</div>
</div>