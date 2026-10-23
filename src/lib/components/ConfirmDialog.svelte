<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	type Props = {
		title: string;
		message: string;
		confirmLabel?: string;
		cancelLabel?: string;
		confirmTone?: 'danger' | 'success' | 'default';
		onConfirm: () => void;
		onCancel: () => void;
	};
	let {
		title,
		message,
		confirmLabel = 'Delete',
		cancelLabel = 'Cancel',
		confirmTone = 'danger',
		onConfirm,
		onCancel
	}: Props = $props();

	const confirmClass = $derived(
		confirmTone === 'danger'
			? 'bg-rose-600 hover:bg-rose-700'
			: confirmTone === 'success'
				? 'bg-emerald-600 hover:bg-emerald-700'
				: 'bg-stone-900 dark:bg-stone-700 hover:bg-stone-800 dark:hover:bg-stone-600'
	);
</script>

<div
	class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 dark:bg-black/60 backdrop-blur-md p-4"
	role="dialog"
	aria-modal="true"
	aria-labelledby="confirm-title"
	tabindex="-1"
	onclick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
	onkeydown={(e) => { if (e.key === 'Escape') onCancel(); }}
	transition:fade={{ duration: motionMs(BACKDROP_MS) }}
>
	<div class="w-full max-w-xs rounded-2xl bg-white dark:bg-stone-900 p-5 shadow-xl" transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}>
		<h2 id="confirm-title" class="text-sm font-semibold text-stone-900 dark:text-stone-100">{title}</h2>
		<p class="mt-1.5 text-sm leading-relaxed text-stone-600 dark:text-stone-300">{message}</p>
		<div class="mt-5 flex justify-end gap-2">
			<button
				type="button"
				class="rounded-full border border-stone-200 dark:border-stone-800 px-4 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
				onclick={onCancel}
			>{cancelLabel}</button>
			<button
				type="button"
				class="rounded-full px-4 py-1.5 text-xs font-medium text-white {confirmClass}"
				onclick={onConfirm}
			>{confirmLabel}</button>
		</div>
	</div>
</div>