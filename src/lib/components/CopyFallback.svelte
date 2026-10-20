<script lang="ts">
	import Copy from '@lucide/svelte/icons/copy';
	import Download from '@lucide/svelte/icons/download';

	type Props = {
		text: string;
		onClose: () => void;
	};
	let { text, onClose }: Props = $props();

	let field = $state<HTMLTextAreaElement | null>(null);
	let note = $state<'' | 'copy' | 'download'>('');

	$effect(() => {
		if (field) {
			field.focus();
			field.select();
		}
	});

	function selectedCopy() {
		if (!field) return;
		field.focus();
		field.select();
		let ok = false;
		try {
			ok = document.execCommand('copy');
		} catch {
			ok = false;
		}
		note = ok ? 'copy' : '';
	}

	function download() {
		const stamp = new Date().toISOString().slice(0, 10);
		const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
		const a = document.createElement('a');
		a.href = url;
		a.download = `fermentario-notes-${stamp}.txt`;
		a.click();
		URL.revokeObjectURL(url);
		note = 'download';
	}
</script>

<div
	class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 dark:bg-black/60 p-4"
	role="dialog"
	aria-modal="true"
	aria-label="Copy notes"
	tabindex="-1"
	onclick={(e) => { if (e.target === e.currentTarget) onClose(); }}
	onkeydown={(e) => { if (e.key === 'Escape') onClose(); }}
>
	<div class="w-full max-w-lg rounded-2xl bg-white dark:bg-stone-900 p-5 shadow-xl">
		<div class="flex items-start justify-between gap-3">
			<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">Notes ready to copy</h2>
			<button class="text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300" aria-label="Close" onclick={onClose}>&times;</button>
		</div>
		<p class="mt-1.5 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
			This address is not a secure origin, so the browser blocks clipboard access. The text below is selected:
			press <span class="font-mono text-[11px] text-stone-700 dark:text-stone-300">⌘C</span> or
			<span class="font-mono text-[11px] text-stone-700 dark:text-stone-300">Ctrl+C</span>, or download it as a file.
		</p>
		<textarea
			bind:this={field}
			readonly
			class="mt-3 max-h-[45dvh] min-h-32 w-full resize-y rounded-xl border border-stone-200 dark:border-stone-800 bg-stone-50 dark:bg-stone-900/60 p-3 font-mono text-[12px] leading-relaxed text-stone-700 dark:text-stone-300 outline-none"
		>{text}</textarea>
		{#if note}
			<p class="mt-2 text-[11px] text-emerald-600 dark:text-emerald-400">
				{note === 'copy' ? 'Copied to the clipboard.' : 'Downloaded.'}
			</p>
		{/if}
		<div class="mt-4 flex flex-wrap justify-end gap-2">
			<button
				type="button"
				class="inline-flex items-center gap-2 rounded-full border border-stone-200 dark:border-stone-800 px-4 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
				onclick={download}
			><Download class="h-3.5 w-3.5" /> Download .txt</button>
			<button
				type="button"
				class="inline-flex items-center gap-2 rounded-full bg-stone-900 dark:bg-stone-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-stone-800 dark:hover:bg-stone-600"
				onclick={selectedCopy}
			><Copy class="h-3.5 w-3.5" /> Copy</button>
		</div>
	</div>
</div>
