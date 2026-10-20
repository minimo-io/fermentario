<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import Maximize2 from '@lucide/svelte/icons/maximize-2';
	import Minimize2 from '@lucide/svelte/icons/minimize-2';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import { showToast } from '$lib/toast.svelte';

	// The modal takes text for ONE new comment and closes on success. The
	// comment list lives on the single item page (task, principle, note) —
	// this modal never shows a thread and never deletes. Add sits below the
	// textarea like every other form dialog.
	type Props = {
		onAdd: (text: string) => Promise<boolean>; // resolves true once stored
		onClose: () => void;
	};
	let { onAdd, onClose }: Props = $props();

	let draft = $state('');
	let saving = $state(false);
	let error = $state('');
	let full = $state(false);
	let draftField = $state<HTMLTextAreaElement | null>(null);

	$effect(() => {
		if (draftField) draftField.focus();
	});

	async function submit() {
		const text = draft.trim();
		if (!text || saving) return;
		saving = true;
		error = '';
		if (await onAdd(text)) {
			showToast('Comment added.', 'success');
			onClose();
		} else {
			error = 'Could not add the comment.';
			saving = false;
		}
	}
</script>

<div
	class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 dark:bg-black/60 transition-[padding] duration-200 ease-out motion-reduce:transition-none {full ? 'p-0' : 'p-4'}"
	role="dialog"
	aria-modal="true"
	aria-label="Add comment"
	tabindex="-1"
	onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
	onkeydown={(e) => {
		if (e.key !== 'Escape') return;
		if (full) full = false;
		else onClose();
	}}
	transition:fade={{ duration: motionMs(BACKDROP_MS) }}
>
	<div
		class="w-full bg-white dark:bg-stone-900 p-5 shadow-xl [interpolate-size:allow-keywords] transition-[height,max-width,border-radius] duration-200 ease-out motion-reduce:transition-none {full ? 'flex h-dvh max-w-full flex-col rounded-none' : 'h-auto max-w-sm rounded-2xl'}"
		transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}
	>
		<div class={full ? 'mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col' : ''}>
			<div class="mb-4 flex items-start justify-between gap-2">
				<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">Add comment</h2>
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
						onclick={onClose}
					>&times;</button>
				</div>
			</div>
			<form
				class={full ? 'flex min-h-0 flex-1 flex-col' : ''}
				onsubmit={(e) => { e.preventDefault(); void submit(); }}
			>
				<textarea
					rows="3"
					class="w-full resize-none rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-3 py-2 text-sm text-stone-800 dark:text-stone-200 outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 {full ? 'min-h-0 flex-1' : ''}"
					placeholder="Add a comment…"
					aria-label="Add a comment"
					value={draft}
					oninput={(e) => { draft = e.currentTarget.value; if (error) error = ''; }}
					bind:this={draftField}
				></textarea>
				{#if error}
					<p class="mt-2 text-xs text-rose-600 dark:text-rose-400" role="alert">{error}</p>
				{/if}
				<div class="mt-3 flex justify-end">
					<button
						type="submit"
						class="rounded-full bg-stone-900 dark:bg-stone-700 px-4 py-1.5 text-xs font-medium whitespace-nowrap text-white hover:bg-stone-800 dark:hover:bg-stone-600 disabled:opacity-50"
						disabled={!draft.trim() || saving}
					>{saving ? 'Saving…' : 'Add'}</button>
				</div>
			</form>
		</div>
	</div>
</div>
