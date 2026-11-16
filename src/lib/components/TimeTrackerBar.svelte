<script lang="ts">
	import { goto } from '$app/navigation';
	import Square from '@lucide/svelte/icons/square';
	import Timer from '@lucide/svelte/icons/timer';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { formatDuration, timeTracker } from '$lib/time-tracker.svelte';
	import { showToast } from '$lib/toast.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

	type Props = { widthClass?: string };
	let { widthClass = 'max-w-2xl' }: Props = $props();

	let stopping = $state(false);
	let confirming = $state(false);
	let deleting = $state(false);

	async function stop() {
		stopping = true;
		const result = await timeTracker.stop();
		stopping = false;
		if (!result.ok) {
			showToast(result.error);
			return;
		}
		showToast('Timer stopped.', 'success');
	}

	async function discard() {
		const entry = timeTracker.running;
		if (!entry) {
			confirming = false;
			return;
		}
		deleting = true;
		const result = await timeTracker.remove(entry.id);
		deleting = false;
		confirming = false;
		if (!result.ok) {
			showToast(result.error);
			return;
		}
		showToast('Time entry deleted.', 'success');
	}
</script>

{#if timeTracker.running}
	<div class="mx-auto {widthClass} mb-4">
		<div class="flex items-center gap-2 rounded-full border border-emerald-200/80 bg-white/95 px-3 py-1.5 shadow-sm shadow-stone-900/5 dark:border-emerald-900/60 dark:bg-stone-900/95">
				<button
					type="button"
					class="flex min-w-0 flex-1 items-center gap-2 text-left"
					onclick={() => void goto('/admin/time-tracker')}
					aria-label="Open time tracker"
				>
					<span class="relative grid h-6 w-6 shrink-0 place-items-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300">
						<span class="pointer-events-none absolute inset-0 rounded-full ring-2 ring-emerald-300 animate-pulse motion-reduce:animate-none dark:ring-emerald-700"></span>
						<Timer class="relative h-3.5 w-3.5" />
					</span>
					<span class="min-w-0 flex-1 truncate text-xs font-medium text-stone-700 dark:text-stone-200">
						{timeTracker.running.comment || 'Time tracker running'}
					</span>
					<span class="shrink-0 font-mono text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-300">
						{formatDuration(timeTracker.elapsedMs)}
					</span>
				</button>
				<button
					type="button"
					class="grid h-7 w-7 shrink-0 place-items-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-stone-800 dark:hover:text-rose-400"
					aria-label="Discard running timer"
					title="Discard"
					disabled={deleting}
					onclick={() => (confirming = true)}
				><Trash2 class="h-3.5 w-3.5" /></button>
				<button
					type="button"
					class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-stone-900 text-white hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-700"
					aria-label="Stop timer"
					disabled={stopping}
					onclick={() => void stop()}
				><Square class="h-3 w-3 fill-current" /></button>
		</div>
	</div>
{/if}

{#if confirming}
	<ConfirmDialog
		title="Discard timer"
		message="Discard the running timer? The elapsed time will not be saved."
		confirmLabel="Discard"
		onConfirm={() => void discard()}
		onCancel={() => (confirming = false)}
	/>
{/if}
