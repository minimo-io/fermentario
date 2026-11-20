<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import Maximize2 from '@lucide/svelte/icons/maximize-2';
	import Minimize2 from '@lucide/svelte/icons/minimize-2';
	import X from '@lucide/svelte/icons/x';
	import CloudUpload from '@lucide/svelte/icons/cloud-upload';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import { quickNote } from '$lib/quick-note.svelte';
	import { renderNoteContent } from '$lib/note-links';

	let textarea = $state<HTMLTextAreaElement | null>(null);

	const statusText = $derived.by(() => {
		if (quickNote.status === 'error') return quickNote.error || 'Could not save on this device.';
		if (quickNote.backupStatus === 'saving') return 'Backing up…';
		if (quickNote.backupStatus === 'saved') return 'Backed up';
		if (quickNote.backupStatus === 'error') return quickNote.backupError || 'Backup failed.';
		const time =
			quickNote.updatedAt > 0
				? new Date(quickNote.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
				: '';
		return time ? `Saved on this device ${time}` : 'Saved on this device';
	});

	const backupTitle = $derived(
		quickNote.backupEnabled ? 'Back up on the server' : 'Back up after you sign in'
	);

	// The editor owns the keyboard when it opens; the view mode has nothing to type into.
	// The caret goes to the end so a long note opens where it was left.
	$effect(() => {
		if (!quickNote.open || quickNote.mode !== 'edit' || !textarea) return;
		textarea.focus();
		const end = textarea.value.length;
		textarea.setSelectionRange(end, end);
	});

	/** True when nothing but this modal is on screen. The search palette and the
	 *  other dialogs share the same z-index and can sit over this one. */
	function aloneOnScreen(): boolean {
		return !Array.from(document.querySelectorAll('[role="dialog"]')).some(
			(d) => d.id !== 'quick-note-dialog'
		);
	}

	/** `e` edits the note, but only from view mode, with no modifier, no repeat
	 *  and no text field focused, so it never steals a keystroke from anything
	 *  else on the page. */
	function canSwitchToEdit(e: KeyboardEvent): boolean {
		if (quickNote.mode !== 'view') return false;
		if (e.repeat || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return false;
		if (e.key.toLowerCase() !== 'e') return false;
		const t = e.target as HTMLElement | null;
		if (t && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return false;
		return aloneOnScreen();
	}

	/** Returns true when it consumed the key, so the backdrop handler can stop
	 *  the same event from reaching the window listener and firing twice. */
	function onKeydown(e: KeyboardEvent): boolean {
		if (!quickNote.open || e.isComposing) return false;
		// The content is already written on every keystroke; Mod+Enter is the
		// explicit save-and-close gesture.
		if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			quickNote.close();
			return true;
		}
		if (e.key !== 'Escape') {
			if (!canSwitchToEdit(e)) return false;
			e.preventDefault();
			quickNote.mode = 'edit';
			return true;
		}
		if (quickNote.full) quickNote.setFull(false);
		else quickNote.close();
		return true;
	}
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.defaultPrevented) return;
		onKeydown(e);
	}}
/>

{#if quickNote.open}
	<div
		id="quick-note-dialog"
		class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 backdrop-blur-md transition-[padding] duration-200 ease-out motion-reduce:transition-none dark:bg-black/60 {quickNote.full
			? 'p-0'
			: 'p-4'}"
		role="dialog"
		aria-modal="true"
		aria-labelledby="quick-note-title"
		tabindex="-1"
		onclick={(e) => {
			if (e.target === e.currentTarget) quickNote.close();
		}}
		onkeydown={(e) => {
			// The window listener handles keys from outside the dialog; this one
			// stops a handled key from reaching it twice.
			if (onKeydown(e)) e.stopPropagation();
		}}
		transition:fade={{ duration: motionMs(BACKDROP_MS) }}
	>
		<div
			class="flex w-full flex-col bg-white p-5 shadow-xl transition-[height,max-width,border-radius] duration-200 ease-out motion-reduce:transition-none dark:bg-stone-900 {quickNote.full
				? 'h-dvh max-w-full rounded-none'
				: 'h-[min(80dvh,44rem)] max-w-2xl rounded-2xl'}"
			transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}
		>
			<div class="flex items-start justify-between gap-2">
				<div class="min-w-0">
					<h2 id="quick-note-title" class="text-sm font-semibold text-stone-900 dark:text-stone-100">Quick note</h2>
					<p
						class="mt-0.5 truncate text-[11px] tabular-nums {quickNote.status === 'error' || quickNote.backupStatus === 'error'
							? 'text-rose-600 dark:text-rose-400'
							: 'text-stone-400 dark:text-stone-500'}"
					>{statusText}</p>
				</div>
				<div class="-mr-1 -mt-1 flex shrink-0 items-center gap-0.5">
					<button
						type="button"
						class="mr-1 grid h-8 w-8 place-items-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-600 disabled:opacity-40 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-300"
						aria-label={backupTitle}
						title={backupTitle}
						disabled={!quickNote.backupEnabled || quickNote.backupStatus === 'saving'}
						onclick={() => void quickNote.backup()}
					>
						<CloudUpload class="h-4 w-4" />
					</button>
					<div class="mr-1 flex rounded-full bg-stone-100 p-0.5 dark:bg-stone-800" role="group" aria-label="Quick note mode">
						<button
							type="button"
							class="rounded-full px-2.5 py-1 text-[11px] font-medium {quickNote.mode === 'edit'
								? 'bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-stone-100'
								: 'text-stone-500 dark:text-stone-400'}"
							aria-pressed={quickNote.mode === 'edit'}
							title="Edit (E)"
							onclick={() => (quickNote.mode = 'edit')}
						>Edit</button>
						<button
							type="button"
							class="rounded-full px-2.5 py-1 text-[11px] font-medium {quickNote.mode === 'view'
								? 'bg-white text-stone-900 shadow-sm dark:bg-stone-700 dark:text-stone-100'
								: 'text-stone-500 dark:text-stone-400'}"
							aria-pressed={quickNote.mode === 'view'}
							onclick={() => (quickNote.mode = 'view')}
						>View</button>
					</div>
					<button
						type="button"
						class="grid h-8 w-8 place-items-center rounded-full text-stone-400 hover:bg-stone-100 hover:text-stone-600 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-300"
						aria-label={quickNote.full ? 'Exit full screen' : 'Full screen'}
						aria-pressed={quickNote.full}
						title={quickNote.full ? 'Exit full screen' : 'Full screen'}
						onclick={() => quickNote.setFull(!quickNote.full)}
					>
						{#if quickNote.full}<Minimize2 class="h-4 w-4" />{:else}<Maximize2 class="h-4 w-4" />{/if}
					</button>
					<button
						type="button"
						class="grid h-8 w-8 place-items-center rounded-full text-lg leading-none text-stone-400 hover:bg-stone-100 hover:text-stone-600 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-300"
						aria-label="Close"
						onclick={() => quickNote.close()}
					>&times;</button>
				</div>
			</div>

			{#if quickNote.mode === 'edit'}
				<textarea
					bind:this={textarea}
					class="mt-3 min-h-0 w-full flex-1 resize-none rounded-xl border border-stone-200 bg-white p-3 text-base leading-snug text-stone-800 outline-none focus:border-stone-400 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-200 dark:focus:border-stone-600"
					value={quickNote.content}
					oninput={(e) => quickNote.setContent(e.currentTarget.value)}
					placeholder="Write anything. It saves while you type."
					aria-label="Quick note text"
				></textarea>
			{:else}
				<div
					class="mt-3 min-h-0 flex-1 overflow-y-auto whitespace-pre-wrap rounded-xl border border-stone-200 p-3 text-base leading-relaxed text-stone-800 dark:border-stone-800 dark:text-stone-200"
				>
					{#if quickNote.content.trim()}
						{@html renderNoteContent(quickNote.content)}
					{:else}
						<span class="text-stone-400 dark:text-stone-500">Nothing yet.</span>
					{/if}
				</div>
			{/if}
		</div>
	</div>
{/if}
