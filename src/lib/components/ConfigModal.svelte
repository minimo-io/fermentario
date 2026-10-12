<script lang="ts">
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';

	type Lang = 'en' | 'es' | 'pt';
	type LangConfig = { modelLang: Lang; entriesLang: Lang };

	type Props = {
		config: LangConfig;
		onClose: () => void;
		onSave: (config: LangConfig) => void;
		onRestoreStart: (file: File) => void;
	};
	let { config, onClose, onSave, onRestoreStart }: Props = $props();

	// svelte-ignore state_referenced_locally
	let modelLang = $state<Lang>(config.modelLang);
	// svelte-ignore state_referenced_locally
	let entriesLang = $state<Lang>(config.entriesLang);

	const LANGS: { v: Lang; label: string }[] = [
		{ v: 'en', label: 'English' },
		{ v: 'es', label: 'Español' },
		{ v: 'pt', label: 'Português' }
	];


	function save() {
		onSave({ modelLang, entriesLang });
		onClose();
	}

	let confirming = $state(false);
	let chosen = $state<File | null>(null);
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

	function askRestore() {
		const input = document.getElementById('restore-file') as HTMLInputElement | null;
		const file = input?.files?.[0];
		if (!file) {
			restoreErr = 'Choose a database file first.';
			return;
		}
		restoreErr = '';
		chosen = file;
		confirming = true;
	}

	function startRestore() {
		if (!chosen) return;
		const file = chosen;
		chosen = null;
		confirming = false;
		const input = document.getElementById('restore-file') as HTMLInputElement | null;
		if (input) input.value = '';
		onRestoreStart(file);
	}
</script>

<div
	class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 p-4"
	role="dialog"
	aria-modal="true"
	tabindex="-1"
	onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
	onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
>
	<div class="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
		<div class="mb-4 flex items-center justify-between">
			<h2 class="text-sm font-semibold text-stone-900">Config</h2>
		</div>

		<label class="mb-1 block text-xs font-medium text-stone-500" for="model-lang">Model language</label>
		<div id="model-lang" class="mb-4 flex gap-2">
			{#each LANGS as l}
				<button
					type="button"
					class="rounded-full border px-3 py-1 text-xs font-medium {modelLang === l.v ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-100'}"
					onclick={() => (modelLang = l.v)}
				>{l.label}</button>
			{/each}
		</div>

		<label class="mb-1 block text-xs font-medium text-stone-500" for="entries-lang">Entries language</label>
		<div id="entries-lang" class="mb-6 flex gap-2">
			{#each LANGS as l}
				<button
					type="button"
					class="rounded-full border px-3 py-1 text-xs font-medium {entriesLang === l.v ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-100'}"
					onclick={() => (entriesLang = l.v)}
				>{l.label}</button>
			{/each}
		</div>

		<div class="mb-6">
			<a
				href="/api/export"
				download="fermentario-{new Date().toISOString().slice(0, 10)}.db"
				class="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100 {exporting ? 'opacity-60' : ''}"
				aria-disabled={exporting}
				onclick={downloadDatabase}
			>{exporting ? 'Downloading…' : 'Download database'}</a>
			<p class="mt-1.5 text-[11px] leading-snug text-stone-400">
				A SQLite file with your notes, tags, weekly recaps and ask history. Keep it somewhere safe.
			</p>
			{#if exportErr}
				<p class="mt-1.5 text-[11px] text-rose-600">{exportErr}</p>
			{/if}
		</div>

		<div class="mb-6 border-t border-stone-200 pt-4">
			<a
				href="/diagnostics"
				class="inline-flex items-center gap-2 rounded-full border border-stone-300 bg-white px-4 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100"
				onclick={onClose}>Diagnostics</a
			>
			<p class="mt-1.5 text-[11px] leading-snug text-stone-400">
				What this device supports: cross-origin isolation, WebGPU, speech, storage. Copy the report when
				reporting a problem.
			</p>
		</div>

		<div class="mb-6 border-t border-stone-200 pt-4">
			<p class="text-xs font-medium text-stone-500">Restore from database</p>
			<div class="mt-2 flex flex-wrap items-center gap-2">
				<input
					id="restore-file"
					type="file"
					accept=".db,.sqlite,.sqlite3,application/vnd.sqlite3"
					class="max-w-full text-[11px] text-stone-500 file:mr-2 file:rounded-full file:border file:border-stone-300 file:bg-white file:px-3 file:py-1.5 file:text-[11px] file:font-medium file:text-stone-600 hover:file:bg-stone-100"
				/>
				<button
					type="button"
					class="rounded-full border border-rose-300 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
					onclick={askRestore}
				>Restore…</button>
			</div>
			<p class="mt-1.5 text-[11px] leading-snug text-stone-400">
				Replaces everything currently stored: notes, tags, weekly recaps and ask history. Download a backup
				first if you want to keep what is here now.
			</p>
			{#if restoreErr}
				<p class="mt-1.5 text-[11px] text-rose-600">{restoreErr}</p>
			{/if}
		</div>

		<div class="flex justify-end gap-2">
			<button
				type="button"
				class="rounded-full border border-stone-200 px-4 py-1.5 text-xs font-medium text-stone-600 hover:bg-stone-100"
				onclick={onClose}
			>Cancel</button>
			<button
				type="button"
				class="rounded-full bg-stone-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-stone-800"
				onclick={save}
			>Save</button>
		</div>
	</div>
</div>

{#if confirming && chosen}
	<ConfirmDialog
		title="Replace your journal?"
		message="{chosen.name} will replace everything stored right now: every note, tag, weekly recap and saved question with its answer. This cannot be undone. Download a backup first if you want to keep what is here."
		confirmLabel="Replace everything"
		cancelLabel="Cancel"
		confirmTone="danger"
		onConfirm={startRestore}
		onCancel={() => { confirming = false; chosen = null; }}
	/>
{/if}