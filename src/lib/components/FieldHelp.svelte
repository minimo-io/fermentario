<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';

	// Tiny explainer modal for a form field. Sits above the stock modal
	// (`z-[60]`) and stops Escape so the parent form stays open.
	type Props = {
		title: string;
		body: string[];
		onClose: () => void;
	};
	let { title, body, onClose }: Props = $props();
</script>

<div
	class="fixed inset-0 z-[60] grid place-items-center bg-stone-900/40 dark:bg-black/60 backdrop-blur-md p-4"
	role="dialog"
	aria-modal="true"
	aria-label={title}
	tabindex="-1"
	onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
	onkeydown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose(); } }}
	transition:fade={{ duration: motionMs(BACKDROP_MS) }}
>
	<div class="w-full max-w-sm rounded-2xl bg-white dark:bg-stone-900 p-5 shadow-xl" transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}>
		<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">{title}</h2>
		<div class="mt-2 space-y-2">
			{#each body as paragraph (paragraph)}
				<p class="text-sm leading-relaxed text-stone-600 dark:text-stone-300">{paragraph}</p>
			{/each}
		</div>
		<div class="mt-4 flex justify-end">
			<button
				type="button"
				class="rounded-full bg-stone-900 dark:bg-stone-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-stone-800 dark:hover:bg-stone-600"
				onclick={onClose}
			>Got it</button>
		</div>
	</div>
</div>
