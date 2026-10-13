<script lang="ts">
	import Copy from '@lucide/svelte/icons/copy';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Star from '@lucide/svelte/icons/star';
	import Volume2 from '@lucide/svelte/icons/volume-2';
	import Trash from '@lucide/svelte/icons/trash';
	import type { Note } from '$lib/types';

	type Props = {
		note: Note;
		onListen: (note: Note) => void;
		onEdit: (note: Note) => void;
		onDelete: (note: Note) => void;
		onFeature: (note: Note) => void;
		onClose: () => void;
	};
	let { note, onListen, onEdit, onDelete, onFeature, onClose }: Props = $props();

	let copied = $state(false);
	let copyErr = $state('');

	async function copyNote() {
		try {
			await navigator.clipboard.writeText(note.content);
			copied = true;
			copyErr = '';
			setTimeout(() => (copied = false), 1500);
		} catch {
			copyErr = 'Could not copy — clipboard unavailable.';
		}
	}
</script>

<div
	class="fixed inset-0 z-50 grid place-items-end bg-stone-900/40 p-4 sm:place-items-center"
	role="dialog"
	aria-modal="true"
	aria-label="Note actions"
	tabindex="-1"
	onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
	onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
>
	<div class="w-full max-w-sm rounded-2xl bg-white p-2 shadow-xl">
		<div class="px-3.5 pb-2 pt-3">
			<h2 class="text-sm font-semibold text-stone-900">Note actions</h2>
			<p class="mt-0.5 line-clamp-2 text-xs text-stone-500">{note.content}</p>
		</div>
		<div class="flex flex-col">
			<button
				type="button"
				class="flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
				onclick={() => { onListen(note); }}
			>
				<Volume2 class="h-4 w-4 text-stone-400" /> Read aloud
			</button>
			<button
				type="button"
				class="flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
				onclick={() => { onEdit(note); }}
			>
				<Pencil class="h-4 w-4 shrink-0 text-stone-400" /> Edit
			</button>
			<button
				type="button"
				class="flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
				onclick={() => { onFeature(note); }}
			>
				<Star class="h-4 w-4 fill-amber-400 text-amber-400" /> {note.featured ? 'Unfeature' : 'Feature'}
			</button>
			<button
				type="button"
				class="flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-stone-700 hover:bg-stone-100"
				onclick={copyNote}
			>
				<Copy class="h-4 w-4 text-stone-400" /> {copied ? 'Copied' : 'Copy to clipboard'}
			</button>
			<button
				type="button"
				class="flex min-h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-rose-600 hover:bg-rose-50"
				onclick={() => { onDelete(note); }}
			>
				<Trash class="h-4 w-4 shrink-0" /> Delete
			</button>
		</div>
		{#if copyErr}
			<p class="px-3.5 pb-2 pt-1 text-xs text-rose-500">{copyErr}</p>
		{/if}
	</div>
</div>