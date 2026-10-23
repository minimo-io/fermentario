<script lang="ts">
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

	type Props = { onRestoreStart: (file: File) => void };
	let { onRestoreStart }: Props = $props();

	const DB_EXTENSIONS = ['.db', '.sqlite', '.sqlite3'];

	let confirming = $state(false);
	let selected = $state<File | null>(null);
	let fileInput = $state<HTMLInputElement | null>(null);
	let restoreErr = $state('');
	let exporting = $state(false);
	let exportErr = $state('');

	/** Download the database without navigating.
	 *
	 *  A same-origin <a download> is turned into a real navigation by iOS
	 *  Safari, which replaced the whole app. Fetching the bytes and saving them
	 *  from a blob URL works there and keeps the SPA state. The click on the
	 *  injected anchor is stopped from bubbling so SvelteKit's delegated
	 *  listener never sees it, and the element is removed straight after. */
	async function downloadDatabase(e: MouseEvent) {
		e.preventDefault();
		if (exporting) return;
		exporting = true;
		exportErr = '';
		try {
			const res = await fetch('/api/export');
			if (!res.ok) throw new Error('The database could not be prepared.');
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = `fermentario-${new Date().toISOString().slice(0, 10)}.db`;
			a.addEventListener('click', (ev) => ev.stopPropagation());
			document.body.appendChild(a);
			a.click();
			a.remove();
			setTimeout(() => URL.revokeObjectURL(url), 1000);
		} catch (err) {
			exportErr = (err as Error)?.message ?? 'The download failed.';
		} finally {
			exporting = false;
		}
	}

	function pickFile(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0] ?? null;
		restoreErr = '';
		if (!file) {
			selected = null;
			return;
		}
		if (!DB_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext))) {
			selected = null;
			input.value = '';
			restoreErr = 'Choose a .db, .sqlite or .sqlite3 file.';
			return;
		}
		if (file.size === 0) {
			selected = null;
			input.value = '';
			restoreErr = 'That file is empty. Choose a database file.';
			return;
		}
		selected = file;
	}

	function askRestore() {
		if (!selected) return;
		restoreErr = '';
		confirming = true;
	}

	function startRestore() {
		if (!selected) return;
		const file = selected;
		selected = null;
		confirming = false;
		if (fileInput) fileInput.value = '';
		onRestoreStart(file);
	}
</script>

<div>
	<a
		href="/api/export"
		download="fermentario-{new Date().toISOString().slice(0, 10)}.db"
		class="inline-flex items-center gap-2 rounded-full border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-4 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 {exporting ? 'opacity-60' : ''}"
		aria-disabled={exporting}
		onclick={downloadDatabase}
	>{exporting ? 'Downloading…' : 'Download database'}</a>
	<p class="mt-1.5 text-[11px] leading-snug text-stone-400 dark:text-stone-500">
		A complete SQLite file of your journal: notes, tasks, principles, comments, tags, recaps and
		questions. Keep it somewhere safe.
	</p>
	{#if exportErr}
		<p class="mt-1.5 text-[11px] text-rose-600 dark:text-rose-400">{exportErr}</p>
	{/if}
</div>

<div class="mt-4 border-t border-stone-200 dark:border-stone-800 pt-4">
	<p class="text-xs font-medium text-stone-500 dark:text-stone-400">Restore from database</p>
	<div class="mt-2 flex flex-wrap items-center gap-2">
		<input
			bind:this={fileInput}
			type="file"
			accept=".db,.sqlite,.sqlite3,application/vnd.sqlite3"
			onchange={pickFile}
			class="max-w-full text-[11px] text-stone-500 dark:text-stone-400 file:mr-2 file:rounded-full file:border file:border-stone-300 dark:file:border-stone-700 file:bg-white dark:file:bg-stone-900 file:px-3 file:py-1.5 file:text-[11px] file:font-medium file:text-stone-600 dark:file:text-stone-300 hover:file:bg-stone-100 dark:hover:file:bg-stone-800"
		/>
		<button
			type="button"
			class="rounded-full border border-rose-300 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/40 px-3 py-1.5 text-xs font-medium text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-900/50 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-rose-50 dark:disabled:hover:bg-rose-950/40"
			onclick={askRestore}
			disabled={!selected}
		>Restore…</button>
	</div>
	<p class="mt-1.5 text-[11px] leading-snug text-stone-400 dark:text-stone-500">
		Replaces everything currently stored: notes, tasks, principles, comments, tags, recaps, questions
		and tag colors. Download a backup first if you want to keep what is here now.
	</p>
	{#if restoreErr}
		<p class="mt-1.5 text-[11px] text-rose-600 dark:text-rose-400">{restoreErr}</p>
	{/if}
</div>

<div class="mt-4 border-t border-stone-200 dark:border-stone-800 pt-4">
	<a
		href="/diagnostics"
		class="inline-flex items-center gap-2 rounded-full border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-4 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
		>Diagnostics</a
	>
	<p class="mt-1.5 text-[11px] leading-snug text-stone-400 dark:text-stone-500">
		What this device supports: cross-origin isolation, WebGPU, speech, storage. Copy the report when
		reporting a problem.
	</p>
</div>

{#if confirming && selected}
	<ConfirmDialog
		title="Replace your journal?"
		message="{selected.name} will replace everything stored right now: every note, tag, weekly recap and saved question with its answer. This cannot be undone. Download a backup first if you want to keep what is here."
		confirmLabel="Replace everything"
		cancelLabel="Cancel"
		confirmTone="danger"
		onConfirm={startRestore}
		onCancel={() => { confirming = false; }}
	/>
{/if}
