<script lang="ts">
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import CircleCheck from '@lucide/svelte/icons/circle-check';
	import Circle from '@lucide/svelte/icons/circle';

	export type RestorePhase = 'uploading' | 'validating' | 'replacing' | 'search' | 'finishing' | 'done';

	type Props = {
		fileName: string;
		phase: RestorePhase;
		elapsed: number;
		error?: string;
		onClose: () => void;
	};
	let { fileName, phase, elapsed, error = '', onClose }: Props = $props();

	const STEPS: { id: RestorePhase; label: string }[] = [
		{ id: 'uploading', label: 'Uploading the file' },
		{ id: 'validating', label: 'Checking the database' },
		{ id: 'replacing', label: 'Replacing notes, tags, recaps and questions' },
		{ id: 'search', label: 'Rebuilding search' },
		{ id: 'finishing', label: 'Finishing' }
	];

	const currentIndex = $derived(phase === 'done' ? STEPS.length : STEPS.findIndex((s) => s.id === phase));
</script>

<div
	class="fixed inset-0 z-50 grid place-items-center bg-stone-900/50 p-4"
	role="dialog"
	aria-modal="true"
	aria-label="Restoring your journal"
	tabindex="-1"
>
	<div class="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
		{#if error}
			<h2 class="text-sm font-semibold text-stone-900">Restore failed</h2>
			<p class="mt-2 text-sm leading-relaxed text-rose-600">{error}</p>
			<p class="mt-2 text-xs leading-relaxed text-stone-500">
				Nothing was changed. Your journal is exactly as it was.
			</p>
			<div class="mt-5 flex justify-end">
				<button
					type="button"
					class="rounded-full bg-stone-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-stone-800"
					onclick={onClose}
				>Close</button>
			</div>
		{:else}
			<div class="flex items-center gap-2">
				<h2 class="text-sm font-semibold text-stone-900">
					{phase === 'done' ? 'Journal restored' : 'Restoring your journal'}
				</h2>
				{#if phase !== 'done'}<LoaderCircle class="h-4 w-4 animate-spin text-stone-400" />{/if}
			</div>
			<p class="mt-1 break-all text-[11px] text-stone-400">{fileName}</p>

			<ol class="mt-4 space-y-2">
				{#each STEPS as step, i (step.id)}
					{@const state = phase === 'done' || i < currentIndex ? 'done' : i === currentIndex ? 'current' : 'todo'}
					<li class="flex items-center gap-2 text-[13px] {state === 'todo' ? 'text-stone-300' : 'text-stone-700'}">
						{#if state === 'done'}
							<CircleCheck class="h-4 w-4 shrink-0 text-emerald-500" />
						{:else if state === 'current'}
							<LoaderCircle class="h-4 w-4 shrink-0 animate-spin text-stone-500" />
						{:else}
							<Circle class="h-4 w-4 shrink-0 text-stone-300" />
						{/if}
						{step.label}
					</li>
				{/each}
			</ol>

			{#if phase !== 'done'}
				<p class="mt-4 text-[11px] text-stone-400">
					{elapsed}s · keep the app open until this finishes.
				</p>
			{:else}
				<div class="mt-5 flex justify-end">
					<button
						type="button"
						class="rounded-full bg-stone-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-stone-800"
						onclick={onClose}
					>Close</button>
				</div>
			{/if}
		{/if}
	</div>
</div>
