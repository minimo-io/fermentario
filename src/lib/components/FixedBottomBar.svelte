<script lang="ts">
	import type { Snippet } from 'svelte';

	/** The fixed bottom slot. Only one bottom bar is ever mounted, and it
	 *  publishes its height as `--composer-h` so the page reserves space,
	 *  exactly like the note composer does. */
	type Props = {
		widthClass?: string;
		children: Snippet;
	};
	let { widthClass = 'max-w-2xl', children }: Props = $props();

	let bar = $state<HTMLDivElement | null>(null);

	$effect(() => {
		if (!bar || typeof ResizeObserver === 'undefined') return;
		const observer = new ResizeObserver(() => {
			document.documentElement.style.setProperty('--composer-h', `${bar?.offsetHeight ?? 0}px`);
		});
		observer.observe(bar);
		return () => observer.disconnect();
	});
</script>

<div class="pointer-events-none fixed inset-x-0 bottom-0 z-20">
	<div class="pointer-events-auto mx-auto {widthClass} px-6 pb-8">
		<div bind:this={bar} class="flex items-center gap-2 rounded-[2rem] border border-stone-200/80 bg-white/95 py-2 pl-3 pr-2 shadow-xl shadow-stone-900/10 sm:py-3 sm:pl-5 sm:pr-3">
			{@render children()}
		</div>
	</div>
</div>
