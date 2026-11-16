<script lang="ts">
	import { onMount } from 'svelte';
	import type { TimeEntry } from '$lib/types';
	import { miniApps } from '$lib/mini-apps.svelte';
	import { formatDuration, timeTracker } from '$lib/time-tracker.svelte';
	import Play from '@lucide/svelte/icons/play';
	import Square from '@lucide/svelte/icons/square';
	import Timer from '@lucide/svelte/icons/timer';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import { showToast } from '$lib/toast.svelte';
	import { dayLocale } from '$lib/dates';
	import { splitTrailingHashtags } from '$lib/hashtags';
	import { tagColors } from '$lib/tag-colors.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import TimeTrackerChart from '$lib/components/TimeTrackerChart.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

	type Props = { onError: (msg: string) => void; widthClass?: string; lang?: string };
	let { onError, widthClass = 'max-w-2xl', lang = 'en' }: Props = $props();

	let comment = $state('');
	let starting = $state(false);
	let stopping = $state(false);
	let showStart = $state(false);
	let pendingDelete = $state<TimeEntry | null>(null);
	let deleting = $state(false);
	let revision = $state(0);

	const pendingTags = $derived(splitTrailingHashtags(comment).tags);

	onMount(() => {
		miniApps.loadUsage();
		miniApps.recordUse('time-tracker');
		void timeTracker.load();
		void tagColors.load();
	});

	function fmtWhen(at: number): string {
		return new Date(at).toLocaleString(dayLocale(lang), {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	async function start() {
		starting = true;
		const result = await timeTracker.start(comment.trim());
		starting = false;
		if (!result.ok) {
			onError(result.error);
			return;
		}
		comment = '';
		showStart = false;
		showToast('Timer started.', 'success');
	}

	async function stop(id?: string) {
		stopping = true;
		const result = await timeTracker.stop(id);
		stopping = false;
		if (!result.ok) {
			onError(result.error);
			return;
		}
		showToast('Timer stopped.', 'success');
	}

	function durationOf(entry: TimeEntry): string {
		const end = entry.endedAt ?? timeTracker.now;
		return formatDuration(Math.max(0, end - entry.startedAt));
	}

	async function discard() {
		const entry = pendingDelete;
		if (!entry) return;
		deleting = true;
		const result = await timeTracker.remove(entry.id);
		deleting = false;
		pendingDelete = null;
		if (!result.ok) {
			onError(result.error);
			return;
		}
		revision++;
		showToast('Time entry deleted.', 'success');
	}
</script>

<div class="mx-auto {widthClass} px-2 sm:px-6">
	<section class="mb-6 rounded-2xl border border-stone-200 bg-white px-4 py-4 dark:border-stone-800 dark:bg-stone-900">
		<div class="mb-3 flex items-center justify-between gap-2">
			<h2 class="flex items-center gap-2 text-sm font-semibold text-stone-900 dark:text-stone-100">
				<Timer class="h-4 w-4" /> Time tracker
			</h2>
			{#if timeTracker.running}
				<span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
					<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 motion-reduce:animate-none"></span>
					Running
				</span>
			{:else if !showStart}
				<button
					type="button"
					class="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
					onclick={() => (showStart = true)}
				><Play class="h-3.5 w-3.5 fill-current" /> Start</button>
			{/if}
		</div>

		{#if timeTracker.running}
			<div class="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-3 dark:border-emerald-900/60 dark:bg-emerald-950/20">
				<p class="text-[11px] font-medium uppercase tracking-widest text-emerald-700 dark:text-emerald-400">Active timer</p>
				<p class="mt-1 text-2xl font-semibold tabular-nums text-stone-900 dark:text-stone-100">{formatDuration(timeTracker.elapsedMs)}</p>
				<p class="mt-1 text-sm text-stone-700 dark:text-stone-300">{timeTracker.running.comment || 'No comment'}</p>
				{#if timeTracker.running.tags?.length}
					<div class="mt-1.5 flex flex-wrap gap-1">
						{#each timeTracker.running.tags as tag (tag)}
							<TagChip {tag} picker={false} />
						{/each}
					</div>
				{/if}
				<p class="mt-0.5 text-[11px] text-stone-500 dark:text-stone-400">Started {fmtWhen(timeTracker.running.startedAt)}</p>
				<div class="mt-3 flex items-center gap-2">
					<button
						type="button"
						class="inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-700 dark:hover:bg-stone-600"
						disabled={stopping}
						onclick={() => void stop()}
					><Square class="h-3.5 w-3.5 fill-current" /> {stopping ? 'Stopping…' : 'Stop'}</button>
					<button
						type="button"
						class="inline-flex items-center gap-1.5 rounded-full border border-stone-200 px-3.5 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
						disabled={deleting}
						onclick={() => (pendingDelete = timeTracker.running)}
					><Trash2 class="h-3.5 w-3.5" /> Discard</button>
				</div>
			</div>
		{:else if showStart}
			<div class="rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 dark:border-stone-800 dark:bg-stone-950/40">
				<label class="block text-xs font-medium text-stone-500 dark:text-stone-400" for="tt-comment">What are you measuring?</label>
				<input
					id="tt-comment"
					type="text"
					class="mt-1 w-full rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-sm text-stone-800 outline-none focus:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
					placeholder="Optional comment… add #project"
					bind:value={comment}
					onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void start(); } }}
				/>
				{#if pendingTags.length > 0}
					<div class="mt-2 flex flex-wrap items-center gap-1">
						{#each pendingTags as tag (tag)}
							<span class="rounded-full border border-dashed border-stone-300 bg-white/80 px-2 py-0.5 text-[11px] text-stone-500 dark:border-stone-700 dark:bg-stone-900/80 dark:text-stone-400">#{tag}</span>
						{/each}
					</div>
				{/if}
				<div class="mt-2 flex items-center gap-2">
					<button
						type="button"
						class="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
						disabled={starting}
						onclick={() => void start()}
					><Play class="h-3.5 w-3.5 fill-current" /> {starting ? 'Starting…' : 'Start timer'}</button>
					<button
						type="button"
						class="rounded-full px-3 py-2 text-sm text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
						onclick={() => (showStart = false)}
					>Cancel</button>
				</div>
			</div>
		{/if}
	</section>

	<TimeTrackerChart {revision} />

	<section>
		<h2 class="mb-2 text-xs font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500">History</h2>
		{#if timeTracker.entries.length === 0}
			<p class="rounded-2xl border border-dashed border-stone-300 px-4 py-8 text-center text-sm text-stone-500 dark:border-stone-700 dark:text-stone-400">
				No timers yet.
			</p>
		{:else}
			<ul class="space-y-2">
				{#each timeTracker.entries as entry (entry.id)}
					<li class="rounded-2xl border border-stone-200 bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-900 {entry.endedAt ? '' : 'ring-1 ring-emerald-300 dark:ring-emerald-800'}">
						<div class="flex items-start justify-between gap-3">
							<div class="min-w-0 flex-1">
								<p class="text-[14px] text-stone-800 dark:text-stone-200">{entry.comment || 'No comment'}</p>
								{#if entry.tags?.length}
									<div class="mt-1 flex flex-wrap gap-1">
										{#each entry.tags as tag (tag)}
											<TagChip {tag} picker={false} />
										{/each}
									</div>
								{/if}
								<p class="mt-0.5 text-[11px] text-stone-400 dark:text-stone-500">
									{fmtWhen(entry.startedAt)}{#if entry.endedAt} · {fmtWhen(entry.endedAt)}{/if}
								</p>
							</div>
							<div class="shrink-0 text-right">
								<p class="font-mono text-sm font-medium tabular-nums text-stone-900 dark:text-stone-100">{durationOf(entry)}</p>
								<div class="mt-1 flex items-center justify-end gap-2">
									{#if !entry.endedAt}
										<button
											type="button"
											class="text-[11px] font-medium text-rose-600 hover:underline dark:text-rose-400"
											disabled={stopping}
											onclick={() => void stop(entry.id)}
										>Stop</button>
									{/if}
									<button
										type="button"
										class="grid h-6 w-6 place-items-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-rose-600 disabled:opacity-50 dark:hover:bg-stone-800 dark:hover:text-rose-400"
										aria-label="Delete time entry"
										title="Delete"
										disabled={deleting}
										onclick={() => (pendingDelete = entry)}
									><Trash2 class="h-3.5 w-3.5" /></button>
								</div>
							</div>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>

{#if pendingDelete}
	<ConfirmDialog
		title={pendingDelete.endedAt ? 'Delete time entry' : 'Discard timer'}
		message={pendingDelete.endedAt
			? 'Delete this time entry? This cannot be undone.'
			: 'Discard the running timer? The elapsed time will not be saved.'}
		confirmLabel={pendingDelete.endedAt ? 'Delete' : 'Discard'}
		onConfirm={() => void discard()}
		onCancel={() => (pendingDelete = null)}
	/>
{/if}
