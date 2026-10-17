<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';

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
	let draftField = $state<HTMLTextAreaElement | null>(null);

	$effect(() => {
		if (draftField) draftField.focus();
	});

	async function submit() {
		const text = draft.trim();
		if (!text || saving) return;
		saving = true;
		if (await onAdd(text)) onClose();
		else saving = false;
	}
</script>

<div
	class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 p-4"
	role="dialog"
	aria-modal="true"
	aria-label="Add comment"
	tabindex="-1"
	onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
	onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
	transition:fade={{ duration: motionMs(BACKDROP_MS) }}
>
	<div class="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}>
		<div class="mb-4 flex items-start justify-between gap-2">
			<h2 class="text-sm font-semibold text-stone-900">Add comment</h2>
			<button class="shrink-0 text-stone-400 hover:text-stone-600" aria-label="Close" onclick={onClose}>&times;</button>
		</div>
		<form
			onsubmit={(e) => { e.preventDefault(); void submit(); }}
		>
			<textarea
				rows="3"
				class="w-full resize-none rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 outline-none placeholder:text-stone-400"
				placeholder="Add a comment…"
				aria-label="Add a comment"
				value={draft}
				oninput={(e) => (draft = e.currentTarget.value)}
				bind:this={draftField}
			></textarea>
			<div class="mt-3 flex justify-end">
				<button
					type="submit"
					class="rounded-full bg-stone-900 px-4 py-1.5 text-xs font-medium whitespace-nowrap text-white hover:bg-stone-800 disabled:opacity-50"
					disabled={!draft.trim() || saving}
				>Add</button>
			</div>
		</form>
	</div>
</div>
