<script lang="ts">
	import Play from '@lucide/svelte/icons/play';
	import { youTubeEmbedUrl, youTubeThumbnailUrl, youTubeWatchUrl } from '$lib/youtube';

	/** Click-to-load player: no third-party request until the user asks, and
	 *  the thumbnail reserves the 16:9 slot so the card never jumps. With
	 *  autoplay the caller already asks: go straight to the player, playing. */
	type Props = { id: string; autoplay?: boolean };
	let { id, autoplay = false }: Props = $props();

	let loaded = $state(false);
</script>

{#if autoplay || loaded}
	<iframe
		class="aspect-video w-full rounded-xl"
		src={youTubeEmbedUrl(id) + (autoplay ? '?autoplay=1' : '')}
		title="YouTube video"
		allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
		allowfullscreen
		loading="lazy"
	></iframe>
{:else}
	<a
		href={youTubeWatchUrl(id)}
		target="_blank"
		rel="noopener noreferrer"
		class="relative block aspect-video w-full overflow-hidden rounded-xl bg-stone-100 dark:bg-stone-800"
		aria-label="Play video"
		onclick={(e) => { e.preventDefault(); loaded = true; }}
	>
		<img src={youTubeThumbnailUrl(id)} alt="" class="h-full w-full object-cover" loading="lazy" />
		<span class="absolute inset-0 grid place-items-center">
			<span class="grid h-12 w-12 place-items-center rounded-full bg-stone-900/80 dark:bg-black/60 text-white"><Play class="h-5 w-5 fill-current" /></span>
		</span>
	</a>
{/if}
