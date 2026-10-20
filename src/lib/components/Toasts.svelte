<script lang="ts">
	import { toast } from '$lib/toast.svelte';
</script>

{#if toast.current}
	<div class="pointer-events-none fixed inset-x-0 bottom-28 z-30 flex justify-center px-6">
		<p class="rounded-full px-4 py-1.5 text-xs shadow-sm {toast.current.tone === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300' : 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400'}">{toast.current.text}</p>
	</div>
{/if}
