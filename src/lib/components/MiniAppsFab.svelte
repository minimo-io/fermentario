<script lang="ts">
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import { miniApps } from '$lib/mini-apps.svelte';
	import { timeTracker } from '$lib/time-tracker.svelte';

</script>

<button
	type="button"
	class="pointer-events-auto fixed right-4 z-20 grid h-12 w-12 place-items-center rounded-full bg-stone-900 text-white shadow-lg shadow-stone-900/20 hover:bg-stone-800 dark:bg-stone-700 dark:hover:bg-stone-600 sm:right-6"
	style="bottom: 1.5rem;"
	aria-label="Open mini apps"
	aria-haspopup="dialog"
	onclick={() => miniApps.openModal()}
>
	<LayoutGrid class="h-5 w-5" />
	{#if timeTracker.running}
		<span class="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-stone-950" aria-label="A mini app is running"></span>
	{/if}
</button>
