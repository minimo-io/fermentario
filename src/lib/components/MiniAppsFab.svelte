<script lang="ts">
	import LayoutGrid from '@lucide/svelte/icons/layout-grid';
	import { miniApps } from '$lib/mini-apps.svelte';
	import { timeTracker } from '$lib/time-tracker.svelte';
	import { newNote } from '$lib/new-note.svelte';

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
	{#if timeTracker.chiming || newNote.hasDraft || timeTracker.running}
		<span
			class="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full ring-2 ring-white dark:ring-stone-950 {timeTracker.chiming
				? 'bg-amber-400'
				: newNote.hasDraft ? 'bg-lime-400' : 'bg-emerald-500'}"
			aria-label={timeTracker.chiming ? 'The timer is chiming' : newNote.hasDraft ? 'A note draft is waiting' : 'A mini app is running'}
		></span>
		{#if timeTracker.chiming}
			<span class="absolute -right-0.5 -top-0.5 h-3 w-3 animate-ping rounded-full bg-amber-400/70 motion-reduce:animate-none"></span>
		{/if}
	{/if}
</button>
