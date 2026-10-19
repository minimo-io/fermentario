<script lang="ts">
	import { toast } from '$lib/toast.svelte';
</script>

{#if toast.current}
	<div class="pointer-events-none fixed inset-x-0 bottom-28 z-30 flex justify-center px-6">
		<p class="rounded-full px-4 py-1.5 text-xs shadow-sm {toast.current.tone === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-rose-50 text-rose-600'}">{toast.current.text}</p>
	</div>
{/if}
