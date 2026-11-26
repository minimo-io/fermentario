<script lang="ts">
	import { toast } from '$lib/toast.svelte';
	import { playPing } from '$lib/sound';

	// The one place sounds are played: a toast asked for it when it appeared.
	// The effect reads `toast.current`, so it fires per shown toast, not per
	// frame; soundless toasts never reach playPing.
	$effect(() => {
		if (toast.current?.sound) playPing();
	});
</script>

{#if toast.current}
	<div class="pointer-events-none fixed inset-x-0 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-[60] flex justify-center px-6">
		<p class="rounded-full px-4 py-1.5 text-xs shadow-sm {toast.current.tone === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'}">{toast.current.text}</p>
	</div>
{/if}
