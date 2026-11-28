<script lang="ts">
	import { fade } from 'svelte/transition';
	import X from '@lucide/svelte/icons/x';
	import { motionMs } from '$lib/motion';

	type Props = { coverId: string; variant?: 'row' | 'page' | 'public-row' };
	let { coverId, variant = 'row' }: Props = $props();
	let viewing = $state(false);
	const src = $derived(`/api/notes/photos/${encodeURIComponent(coverId)}`);
</script>

{#if variant === 'page'}
	<img {src} alt="Note cover" loading="lazy" class="mb-2 h-auto w-full rounded-xl" />
{:else}
	<button type="button" class="mb-2 block w-full overflow-hidden rounded-xl" aria-label="View note cover image" aria-haspopup="dialog" onclick={() => (viewing = true)}>
		<img {src} alt="" loading="lazy" class="w-full object-cover {variant === 'public-row' ? 'h-32' : 'max-h-40'}" />
	</button>
{/if}

{#if viewing}
	<div
		class="fixed inset-0 z-[70] grid place-items-center bg-black/80 p-4"
		role="dialog"
		aria-modal="true"
		aria-label="Note cover image"
		tabindex="-1"
		onclick={(event) => { if (event.target === event.currentTarget) viewing = false; }}
		onkeydown={(event) => { if (event.key === 'Escape') { event.stopPropagation(); viewing = false; } }}
		transition:fade={{ duration: motionMs(150) }}
	>
		<button type="button" class="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80" aria-label="Close image" onclick={() => (viewing = false)}><X class="h-5 w-5" /></button>
		<img {src} alt="Note cover" class="max-h-[calc(100dvh-4rem)] max-w-full rounded-xl object-contain" />
	</div>
{/if}
