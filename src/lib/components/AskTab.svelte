<script lang="ts">
	import type { AskEntry, AskSource } from '$lib/types';

	type Props = {
		asks: AskEntry[];
		lastQuestion: string;
		answer: string;
		answerSources: AskSource[];
		answering: boolean;
		answerStopped?: boolean;
		onDelete: (id: string) => void;
	};
	let { asks, lastQuestion, answer, answerSources, answering, answerStopped, onDelete }: Props = $props();

	let threadEl = $state<HTMLDivElement | undefined>(undefined);
	// Plain variable, deliberately not reactive: it only records the last
	// position we scrolled to, so reading it must not re-trigger the effect.
	let lastTopKey = '';

	// Newest-first thread: bring the newest card into view when a new entry
	// lands or streaming starts, and leave the scroll alone otherwise so
	// reading older history is not interrupted.
	$effect(() => {
		const key = answering ? `streaming:${lastQuestion}` : (asks[0]?.id ?? '');
		if (threadEl && key && key !== lastTopKey) {
			threadEl.scrollTop = 0;
			lastTopKey = key;
		}
	});

	function when(ts: number) {
		return new Date(ts).toLocaleString(undefined, {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
	}
</script>

<div
	bind:this={threadEl}
	class="mx-auto max-w-2xl space-y-3 overflow-y-auto pb-4 max-h-[55dvh] sm:max-h-[60dvh]"
>
	{#if asks.length === 0 && !answering && !answer}
		<div class="rounded-2xl border border-dashed border-stone-300 p-6 text-center text-sm text-stone-500">
			No questions yet — ask something below.
		</div>
	{:else}
		{#if answering || answer}
			<div class="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 shadow-sm">
				<div class="flex items-start justify-between gap-2">
					<p class="text-sm font-semibold text-stone-800">{lastQuestion}</p>
					{#if answering}
						<span class="inline-block h-3 w-3 animate-spin rounded-full border-2 border-amber-500 border-t-transparent"></span>
					{/if}
				</div>
				<p class="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-stone-700">{answer || '…'}</p>
				{#if answerStopped}
					<p class="mt-1.5 text-[11px] uppercase tracking-wide text-stone-400">stopped — not saved to history</p>
				{/if}
				{#if answerSources.length > 0}
					<details class="mt-2">
						<summary class="cursor-pointer text-[11px] uppercase tracking-wide text-stone-400">Source notes</summary>
						<ul class="mt-1 space-y-0.5 text-xs text-stone-500">
							{#each answerSources as s}<li class="truncate">&bull; {s.content}</li>{/each}
						</ul>
					</details>
				{/if}
			</div>
		{/if}
		{#each asks as entry (entry.id)}
			<div class="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
				<div class="flex items-start justify-between gap-2">
					<p class="text-sm font-semibold text-stone-800">{entry.question}</p>
					<button class="cursor-pointer text-stone-400 hover:text-stone-600" aria-label="Delete this question and answer" onclick={() => onDelete(entry.id)}>&times;</button>
				</div>
				<p class="mt-1 whitespace-pre-wrap text-[15px] leading-relaxed text-stone-700">{entry.answer}</p>
				{#if entry.sources.length > 0}
					<details class="mt-2">
						<summary class="cursor-pointer text-[11px] uppercase tracking-wide text-stone-400">Source notes</summary>
						<ul class="mt-1 space-y-0.5 text-xs text-stone-500">
							{#each entry.sources as s}<li class="truncate">&bull; {s.content}</li>{/each}
						</ul>
					</details>
				{/if}
				<p class="mt-2 text-[10px] text-stone-400">{when(entry.created_at)}</p>
			</div>
		{/each}
	{/if}
</div>