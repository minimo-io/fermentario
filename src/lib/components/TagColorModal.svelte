<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import { TAG_PALETTE, type TagColorKey } from '$lib/tag-palette';
	import { tagColors } from '$lib/tag-colors.svelte';

	type Props = { tag: string; onClose: () => void };
	let { tag, onClose }: Props = $props();

	async function pick(color: TagColorKey) {
		try {
			await tagColors.set(tag, color);
		} catch {
			// The store already reverted; the chip keeps its old color.
		}
		onClose();
	}
</script>

<div
	class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 dark:bg-black/60 backdrop-blur-md p-4"
	role="dialog"
	aria-modal="true"
	aria-label="Tag color for #{tag}"
	tabindex="-1"
	onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
	onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
	transition:fade={{ duration: motionMs(BACKDROP_MS) }}
>
	<div class="w-full max-w-xs rounded-2xl bg-white dark:bg-stone-900 p-5 shadow-xl" transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}>
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">Color for #{tag}</h2>
			<button class="text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300" aria-label="Close" onclick={onClose}>&times;</button>
		</div>
		<div class="grid grid-cols-6 gap-2" role="group" aria-label="Tag color">
			{#each Object.entries(TAG_PALETTE) as [key, p] (key)}
				<button
					type="button"
					class="grid aspect-square place-items-center rounded-xl {p.dot} {tagColors.key(tag) === key ? 'ring-2 ring-stone-900 dark:ring-stone-100 ring-offset-2 dark:ring-offset-stone-900' : ''}"
					aria-label={p.label}
					title={p.label}
					onclick={() => void pick(key as TagColorKey)}
				></button>
			{/each}
		</div>
	</div>
</div>
