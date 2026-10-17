<script lang="ts">
	import VideoEmbed from '$lib/components/VideoEmbed.svelte';

	type Props = { id: string };
	let { id }: Props = $props();

	// The pill marks items that carry a video; clicking toggles the full
	// click-to-load embed below it. The glyph is the YouTube play button,
	// inlined because lucide ships no brand icons.
	let open = $state(false);
</script>

<div class="mt-2">
	<button
		type="button"
		aria-expanded={open}
		aria-label={open ? 'Hide video' : 'Show video'}
		title={open ? 'Hide video' : 'Show video'}
		class="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-medium text-white transition-colors hover:bg-red-500"
		onclick={() => (open = !open)}
	>
		<svg aria-hidden="true" viewBox="0 0 24 24" class="h-3 w-3 fill-current"><path d="M23.5 6.19a3.02 3.02 0 0 0-2.12-2.14C19.5 3.55 12 3.55 12 3.55s-7.5 0-9.38.5A3.02 3.02 0 0 0 .5 6.19 31.6 31.6 0 0 0 0 12a31.6 31.6 0 0 0 .5 5.81 3.02 3.02 0 0 0 2.12 2.14c1.88.5 9.38.5 9.38.5s7.5 0 9.38-.5a3.02 3.02 0 0 0 2.12-2.14A31.6 31.6 0 0 0 24 12a31.6 31.6 0 0 0-.5-5.81zM9.55 15.57V8.43L15.82 12l-6.27 3.57z"/></svg>
		YouTube
	</button>
	{#if open}
		<div class="mt-2"><VideoEmbed {id} autoplay /></div>
	{/if}
</div>
