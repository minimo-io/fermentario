<script lang="ts">
	import { onMount } from 'svelte';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import { navigating } from '$app/state';
	import { loading } from '$lib/loading.svelte';

	let visible = $state(false);
	// The static pill in app.html covers the pre-hydration window. This
	// component removes it on mount and takes over. The first tracked wait
	// shows at once; later waits keep the anti-flash delay.
	let busySeen = false;
	let primed = false;

	onMount(() => {
		document.getElementById('boot-loader')?.remove();
	});

	$effect(() => {
		if (!navigating.to && loading.pending === 0) {
			visible = false;
			if (busySeen) primed = true;
			return;
		}
		busySeen = true;
		if (primed) {
			const timer = setTimeout(() => (visible = true), 120);
			return () => clearTimeout(timer);
		}
		visible = true;
	});
</script>

{#if visible}
	<div
		class="pointer-events-none fixed inset-0 z-[60] grid place-items-center bg-white/25 p-6 backdrop-blur-md dark:bg-stone-950/25"
		role="status"
		aria-live="polite"
	>
		<div
			class="inline-flex items-center gap-2 rounded-full border border-stone-200 dark:border-stone-800 bg-white/95 dark:bg-stone-900/95 px-3.5 py-2 text-xs font-medium text-stone-600 dark:text-stone-300 shadow-lg"
		>
			<LoaderCircle class="h-4 w-4 animate-spin text-amber-500 dark:text-amber-400 motion-reduce:animate-none" />
			Loading…
		</div>
	</div>
{/if}
