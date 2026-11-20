<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { slide } from 'svelte/transition';
	import { motionMs } from '$lib/motion';
	import type { TimeEntry } from '$lib/types';
	import { miniApps } from '$lib/mini-apps.svelte';
	import { formatDuration, timeTracker, type AlertMode } from '$lib/time-tracker.svelte';
	import Play from '@lucide/svelte/icons/play';
	import Square from '@lucide/svelte/icons/square';
	import Timer from '@lucide/svelte/icons/timer';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Settings2 from '@lucide/svelte/icons/settings-2';
	import BellOff from '@lucide/svelte/icons/bell-off';
	import { withTrailingHashtags } from '$lib/hashtags';
	import { showToast } from '$lib/toast.svelte';
	import { dayLocale } from '$lib/dates';
	import { tagColors } from '$lib/tag-colors.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import TimeTrackerChart from '$lib/components/TimeTrackerChart.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

	type Props = { onError: (msg: string) => void; widthClass?: string; lang?: string };
	let { onError, widthClass = 'max-w-2xl', lang = 'en' }: Props = $props();

	let comment = $state('');
	let starting = $state(false);
	let stopping = $state(false);
	let pendingDelete = $state<TimeEntry | null>(null);
	let deleting = $state(false);
	let revision = $state(0);
	let editing = $state(false);
	let draft = $state('');
	let saving = $state(false);
	let alertOpen = $state(false);
	let nextChime = $derived(timeTracker.nextAlertAt);

	const ALERT_OPTIONS: { ms: number; label: string }[] = [
		{ ms: 0, label: 'Off' },
		{ ms: 5 * 60_000, label: '5m' },
		{ ms: 15 * 60_000, label: '15m' },
		{ ms: 30 * 60_000, label: '30m' },
		{ ms: 45 * 60_000, label: '45m' },
		{ ms: 60 * 60_000, label: '1h' },
		{ ms: 90 * 60_000, label: '1h30' }
	];

	const ALERT_MODES: { id: AlertMode; label: string }[] = [
		{ id: 'once', label: 'Once' },
		{ id: '30s', label: '30s' },
		{ id: 'stop', label: 'Until stopped' }
	];

	function alertLabel(ms: number): string {
		if (ms <= 0) return 'Alerts off';
		const option = ALERT_OPTIONS.find((o) => o.ms === ms);
		return `Chime every ${option?.label ?? `${Math.round(ms / 60_000)}m`}`;
	}

	function fmtClock(at: number): string {
		return new Date(at).toLocaleTimeString(dayLocale(lang), { hour: '2-digit', minute: '2-digit' });
	}

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
		editing = false;
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
		editing = false;
		showToast('Timer stopped.', 'success');
	}

	function durationOf(entry: TimeEntry): string {
		const end = entry.endedAt ?? timeTracker.pendingStopAt ?? timeTracker.now;
		return formatDuration(Math.max(0, end - entry.startedAt));
	}

	async function editRunning() {
		const running = timeTracker.running;
		if (!running) return;
		draft = withTrailingHashtags(running.comment, running.tags);
		editing = true;
		await tick();
		document.getElementById('tt-edit')?.focus();
	}

	function cancelEdit() {
		editing = false;
		draft = '';
	}

	async function saveEdit() {
		const running = timeTracker.running;
		if (!running) return;
		saving = true;
		const result = await timeTracker.update(running.id, draft);
		saving = false;
		if (!result.ok) {
			onError(result.error);
			return;
		}
		editing = false;
		showToast('Timer updated.', 'success');
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

{#snippet alertGear()}
	<button
		type="button"
		aria-label="Chime interval"
		title={alertLabel(timeTracker.alertEveryMs)}
		aria-expanded={alertOpen}
		class="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-stone-200 text-stone-500 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-400 dark:hover:bg-stone-800"
		onclick={() => (alertOpen = !alertOpen)}
	>
		<Settings2
			class="h-4 w-4 transition-transform duration-200 motion-reduce:transition-none {alertOpen ? 'rotate-90' : ''}"
		/>
	</button>
{/snippet}

{#snippet alertPanel()}
	{#if alertOpen}
		<div
			transition:slide={{ duration: motionMs(180) }}
			class="mt-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2.5 dark:border-stone-700 dark:bg-stone-800/60"
		>
			<p class="text-[11px] font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500">
				Chime every
			</p>
			<div class="mt-1.5 flex flex-wrap gap-1.5">
				{#each ALERT_OPTIONS as option (option.ms)}
					<button
						type="button"
						aria-pressed={timeTracker.alertEveryMs === option.ms}
						class="rounded-full border px-3 py-1 text-xs font-medium {timeTracker.alertEveryMs === option.ms
							? 'border-emerald-600 bg-emerald-600 text-white'
							: 'border-stone-200 text-stone-600 hover:bg-white dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800'}"
						onclick={() => timeTracker.setAlertEveryMs(option.ms)}
					>{option.label}</button>
				{/each}
			</div>
			<p class="mt-1.5 text-[11px] font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500">
				When it sounds
			</p>
			<div class="mt-1.5 flex flex-wrap gap-1.5">
				{#each ALERT_MODES as mode (mode.id)}
					<button
						type="button"
						aria-pressed={timeTracker.alertMode === mode.id}
						class="rounded-full border px-3 py-1 text-xs font-medium {timeTracker.alertMode === mode.id
							? 'border-emerald-600 bg-emerald-600 text-white'
							: 'border-stone-200 text-stone-600 hover:bg-white dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800'}"
						onclick={() => timeTracker.setAlertMode(mode.id)}
					>{mode.label}</button>
				{/each}
			</div>
			<p class="mt-2 text-[11px] text-stone-500 dark:text-stone-400">
				{#if timeTracker.alertMode === 'once'}
					One short chime at each mark while a timer runs.
				{:else if timeTracker.alertMode === '30s'}
					The chime repeats for 30 seconds at each mark. The stop button ends it sooner.
				{:else}
					The chime repeats at each mark until you stop it.
				{/if}
				This browser keeps the setting.
			</p>
		</div>
	{/if}
{/snippet}

<div class="mx-auto {widthClass}">
	<section class="mb-6 rounded-2xl border border-stone-200 bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-900">
		<div class="flex items-center gap-2">
			<h2 class="flex shrink-0 items-center gap-2 text-sm font-semibold text-stone-900 dark:text-stone-100">
				<Timer class="h-4 w-4 shrink-0" /> <span class="hidden sm:inline">Time tracker</span>
			</h2>
			{#if timeTracker.running}
				<span class="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
					<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500 motion-reduce:animate-none"></span>
					Running
				</span>
			{:else}
				<input
					id="tt-comment"
					type="text"
					aria-label="What are you measuring?"
					class="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-sm text-stone-800 outline-none focus:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
					placeholder="Optional comment… #project"
					bind:value={comment}
					onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void start(); } }}
				/>
				{@render alertGear()}
				<button
					type="button"
					class="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
					disabled={starting}
					onclick={() => void start()}
				><Play class="h-3.5 w-3.5 fill-current" /> {starting ? 'Starting…' : 'Start'}</button>
				{#if comment.trim() !== ''}
					<button
						type="button"
						class="shrink-0 rounded-full px-3 py-2 text-sm text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
						onclick={() => { comment = ''; document.getElementById('tt-comment')?.focus(); }}
					>Cancel</button>
				{/if}
			{/if}
		</div>

		{#if !timeTracker.running}
			{@render alertPanel()}
		{/if}

		{#if timeTracker.running}
			<div
				class="mt-3 rounded-xl border px-4 py-3 transition-colors duration-200 {timeTracker.chiming
					? 'animate-pulse border-amber-400 bg-amber-50/70 motion-reduce:animate-none dark:border-amber-600 dark:bg-amber-950/20'
					: 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/60 dark:bg-emerald-950/20'}"
			>
				<div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
					<p
						class="text-[11px] font-medium uppercase tracking-widest {timeTracker.chiming
							? 'text-amber-700 dark:text-amber-400'
							: 'text-emerald-700 dark:text-emerald-400'}">
						{timeTracker.chiming ? 'Chiming' : 'Active timer'}
					</p>
					<p class="text-[11px] text-stone-500 dark:text-stone-400">
						Started {fmtWhen(timeTracker.running.startedAt)}
						{#if nextChime}<span class="text-stone-400 dark:text-stone-500"> · Next chime {fmtClock(nextChime)}</span>{/if}
					</p>
				</div>

				<div class="mt-1.5 flex flex-col gap-3 md:flex-row md:items-center md:gap-4">
					<p class="shrink-0 text-2xl font-semibold tabular-nums text-stone-900 dark:text-stone-100 md:text-3xl">{formatDuration(timeTracker.elapsedMs)}</p>
					<div class="min-w-0 flex-1">
						{#if editing}
							<div class="flex flex-col gap-2 sm:flex-row sm:items-center">
								<input
									id="tt-edit"
									type="text"
									aria-label="Comment and tags"
									class="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-sm text-stone-800 outline-none focus:border-stone-400 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
									placeholder="Optional comment… #project"
									bind:value={draft}
									onkeydown={(e) => {
										if (e.key === 'Enter') { e.preventDefault(); void saveEdit(); }
										if (e.key === 'Escape') { e.preventDefault(); cancelEdit(); }
									}}
								/>
								<div class="flex shrink-0 items-center gap-2">
									<button
										type="button"
										class="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
										disabled={saving}
										onclick={() => void saveEdit()}
									>{saving ? 'Saving…' : 'Save'}</button>
									<button
										type="button"
										class="rounded-full px-3 py-2 text-sm text-stone-500 hover:bg-stone-100 disabled:opacity-50 dark:hover:bg-stone-800"
										disabled={saving}
										onclick={cancelEdit}
									>Cancel</button>
								</div>
							</div>
							<p class="mt-1 text-[11px] text-stone-500 dark:text-stone-400">#hashtags become tags.</p>
						{:else}
							<p class="text-sm text-stone-700 dark:text-stone-300">{timeTracker.running.comment || 'No comment'}</p>
							{#if timeTracker.running.tags?.length}
								<div class="mt-1 flex flex-wrap gap-1">
									{#each timeTracker.running.tags as tag (tag)}
										<TagChip {tag} picker={false} />
									{/each}
								</div>
							{/if}
						{/if}
					</div>
					<div class="flex flex-wrap items-center gap-2 md:shrink-0 md:justify-end">
						<button
							type="button"
							class="inline-flex items-center gap-1.5 rounded-full bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50 dark:bg-stone-700 dark:hover:bg-stone-600"
							disabled={stopping}
							onclick={() => void stop()}
						><Square class="h-3.5 w-3.5 fill-current" /> {stopping ? 'Stopping…' : 'Stop'}</button>
						{#if !editing}
							<button
								type="button"
								class="inline-flex items-center gap-1.5 rounded-full border border-stone-200 px-3.5 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
								disabled={stopping || deleting}
								onclick={() => void editRunning()}
							><Pencil class="h-3.5 w-3.5" /> Edit</button>
						{/if}
						<button
							type="button"
							class="inline-flex items-center gap-1.5 rounded-full border border-stone-200 px-3.5 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-50 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
							disabled={deleting}
							onclick={() => (pendingDelete = timeTracker.running)}
						><Trash2 class="h-3.5 w-3.5" /> Discard</button>
						{@render alertGear()}
						{#if timeTracker.alerting}
							<button
								type="button"
								class="inline-flex items-center gap-1.5 rounded-full bg-rose-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-rose-700"
								onclick={() => timeTracker.stopAlert()}
							><BellOff class="h-3.5 w-3.5" /> Stop chime</button>
						{/if}
					</div>
				</div>
				{@render alertPanel()}
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
