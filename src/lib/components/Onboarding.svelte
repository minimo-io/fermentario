<script lang="ts">
	import { onMount } from 'svelte';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import RotateCw from '@lucide/svelte/icons/rotate-cw';
	import RestoreOverlay, { type RestorePhase } from '$lib/components/RestoreOverlay.svelte';

	type Props = {
		mode: 'welcome' | 'error';
		error?: string;
	};
	let { mode, error = '' }: Props = $props();

	type Counts = {
		notes: number;
		tags: number;
		recaps: number;
		asks: number;
		todoGroups: number;
		todoItems: number;
		principles: number;
	};

	let creating = $state(false);
	let createError = $state('');
	let retrying = $state(false);
	let restoreName = $state('');
	let restorePhase = $state<RestorePhase | null>(null);
	let restoreError = $state('');
	let restorePickError = $state('');
	let restoreElapsed = $state(0);
	let restoreTimer: ReturnType<typeof setInterval> | undefined;
	let selectedFile = $state<File | null>(null);
	const DB_EXTENSIONS = ['.db', '.sqlite', '.sqlite3'];

	onMount(() => {
		if (mode === 'error') createError = error;
	});

	function goHome() {
		window.location.assign('/');
	}

	async function createJournal() {
		if (creating) return;
		creating = true;
		createError = '';
		try {
			const res = await fetch('/api/journal', { method: 'POST' });
			const data = (await res.json().catch(() => ({}))) as { error?: string };
			if (!res.ok) throw new Error(data.error ?? 'The journal could not be created.');
			goHome();
		} catch (err) {
			createError = (err as Error)?.message ?? 'The journal could not be created.';
		} finally {
			creating = false;
		}
	}

	async function retry() {
		if (retrying) return;
		retrying = true;
		createError = '';
		try {
			const res = await fetch('/api/journal?retry=1');
			const data = (await res.json().catch(() => ({}))) as {
				state?: string;
				error?: string;
			};
			if (data.state === 'active') {
				goHome();
				return;
			}
			if (data.state === 'none') {
				window.location.assign('/welcome');
				return;
			}
			throw new Error(data.error ?? 'The journal still cannot be opened.');
		} catch (err) {
			createError = (err as Error)?.message ?? 'The journal still cannot be opened.';
		} finally {
			retrying = false;
		}
	}

	function closeRestore() {
		restorePhase = null;
		restoreError = '';
		restoreName = '';
	}

	function pickFile(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		restorePickError = '';
		if (!file) {
			selectedFile = null;
			return;
		}
		if (!DB_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))) {
			selectedFile = null;
			input.value = '';
			restorePickError = 'Choose a .db, .sqlite or .sqlite3 file.';
			return;
		}
		if (file.size === 0) {
			selectedFile = null;
			input.value = '';
			restorePickError = 'That file is empty. Choose a database file.';
			return;
		}
		selectedFile = file;
	}

	async function startRestore() {
		const file = selectedFile;
		if (!file) {
			restorePickError = 'Choose a database file first.';
			return;
		}
		restorePickError = '';
		restoreName = file.name;
		restoreError = '';
		restorePhase = 'uploading';
		const started = Date.now();
		restoreElapsed = 0;
		restoreTimer = setInterval(
			() => (restoreElapsed = Math.floor((Date.now() - started) / 1000)),
			1000
		);
		try {
			const body = new FormData();
			body.append('file', file);
			const res = await fetch('/api/journal/restore', { method: 'POST', body });
			if (!res.body) throw new Error('The server did not answer.');
			if (!res.ok) {
				const data = (await res.json().catch(() => ({}))) as { error?: string };
				throw new Error(data.error ?? 'The restore could not start.');
			}
			const reader = res.body.getReader();
			const decoder = new TextDecoder();
			let buffer = '';
			let counts: Counts | null = null;
			for (;;) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const events = buffer.split('\n\n');
				buffer = events.pop() ?? '';
				for (const event of events) {
					for (const line of event.split('\n')) {
						if (!line.startsWith('data: ')) continue;
						const data = JSON.parse(line.slice(6)) as {
							phase?: RestorePhase;
							error?: string;
							done?: boolean;
							counts?: Counts;
						};
						if (data.phase) restorePhase = data.phase;
						else if (data.error) throw new Error(String(data.error));
						else if (data.done) {
							restorePhase = 'done';
							counts = data.counts ?? null;
						}
					}
				}
			}
			restoreName = `${counts?.notes ?? 0} notes restored`;
			setTimeout(goHome, 900);
		} catch (err) {
			restoreError = (err as Error)?.message ?? 'Restore failed.';
		} finally {
			clearInterval(restoreTimer);
			restoreTimer = undefined;
		}
	}
</script>

<main class="mx-auto flex min-h-svh max-w-2xl flex-col justify-center px-6 py-12">
	<div class="rounded-3xl border border-stone-200 bg-white p-6 shadow-sm dark:border-stone-800 dark:bg-stone-900 sm:p-8">
		<p class="text-[11px] font-medium uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">
			fermentario
		</p>
		{#if mode === 'error'}
			<h1 class="mt-2 text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
				Your journal could not be opened
			</h1>
			<p class="mt-3 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
				The file was not changed. Try again, or restore a backup into a new journal.
			</p>
			{#if createError}
				<div class="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-[12px] leading-relaxed text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
					{createError}
				</div>
			{/if}
			<button
				type="button"
				class="mt-5 inline-flex items-center gap-2 rounded-full bg-stone-900 px-4 py-2 text-xs font-medium text-white hover:bg-stone-800 disabled:opacity-60 dark:bg-stone-700 dark:hover:bg-stone-600"
				onclick={retry}
				disabled={retrying}
			>
				{#if retrying}<LoaderCircle class="h-3.5 w-3.5 animate-spin" />{:else}<RotateCw class="h-3.5 w-3.5" />{/if}
				Try again
			</button>
		{:else}
			<h1 class="mt-2 text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
				Start your journal
			</h1>
			<p class="mt-3 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
				A private voice journal for life and the bootstrapped thing. The database stays on this
				device. Create an empty journal, or restore a backup you already have.
			</p>
			{#if createError}
				<div class="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-[12px] leading-relaxed text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">
					{createError}
				</div>
			{/if}
			<button
				type="button"
				class="mt-5 inline-flex items-center gap-2 rounded-full bg-stone-900 px-5 py-2 text-xs font-medium text-white hover:bg-stone-800 disabled:opacity-60 dark:bg-stone-700 dark:hover:bg-stone-600"
				onclick={createJournal}
				disabled={creating}
			>
				{#if creating}<LoaderCircle class="h-3.5 w-3.5 animate-spin" />{/if}
				Create an empty journal
			</button>
		{/if}

		<div class="mt-7 border-t border-stone-200 pt-5 dark:border-stone-800">
			<p class="text-xs font-medium text-stone-500 dark:text-stone-400">Restore from a backup</p>
			<p class="mt-1 text-[11px] leading-snug text-stone-400 dark:text-stone-500">
				Choose a fermentario <code>.db</code> file. It becomes a new journal and leaves the current
				one untouched if anything fails.
			</p>
			<div class="mt-3 flex flex-wrap items-center gap-2">
				<input
					type="file"
					accept=".db,.sqlite,.sqlite3,application/vnd.sqlite3"
					onchange={pickFile}
					class="max-w-full text-[11px] text-stone-500 file:mr-2 file:rounded-full file:border file:border-stone-300 file:bg-white file:px-3 file:py-1.5 file:text-[11px] file:font-medium file:text-stone-600 hover:file:bg-stone-100 dark:text-stone-400 dark:file:border-stone-700 dark:file:bg-stone-900 dark:file:text-stone-300 dark:hover:file:bg-stone-800"
				/>
				<button
					type="button"
					class="rounded-full border border-stone-300 bg-white px-3 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800 dark:disabled:hover:bg-stone-900"
					onclick={startRestore}
					disabled={!selectedFile || restorePhase !== null}
					>Restore…</button
				>
			</div>
			{#if restorePickError}
				<p class="mt-1.5 text-[11px] leading-snug text-rose-600 dark:text-rose-400">{restorePickError}</p>
			{/if}
		</div>
	</div>
	<p class="mt-4 text-center text-[11px] text-stone-400 dark:text-stone-500">
		Local first. No account needed.
	</p>
</main>

{#if restorePhase}
	<RestoreOverlay
		fileName={restoreName}
		phase={restorePhase}
		elapsed={restoreElapsed}
		error={restoreError}
		onClose={closeRestore}
	/>
{/if}
