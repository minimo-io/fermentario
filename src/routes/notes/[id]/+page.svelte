<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import Star from '@lucide/svelte/icons/star';
	import MessageCircle from '@lucide/svelte/icons/message-circle';
	import TagChip from '$lib/components/TagChip.svelte';
	import { inlineMarkdown } from '$lib/markdown-inline';
	import VideoPill from '$lib/components/VideoPill.svelte';
	import { youTubeWatchUrl } from '$lib/youtube';
	import CommentModal from '$lib/components/CommentModal.svelte';
	import CommentItem from '$lib/components/CommentItem.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import EntityTitle from '$lib/components/EntityTitle.svelte';
	import NoteActionsMenu from '$lib/components/NoteActionsMenu.svelte';
	import { contentWidthClass } from '$lib/display';
	import { splitTrailingHashtags, withTrailingHashtags } from '$lib/hashtags';
	import { datetimeLocalTimestamp, datetimeLocalValue } from '$lib/datetime';
	import { loading } from '$lib/loading.svelte';
	import { showToast } from '$lib/toast.svelte';
	import type { Note, NoteComment } from '$lib/types';

	let { data } = $props();
	// svelte-ignore state_referenced_locally
	let note = $state<Note>(data.note);
	// svelte-ignore state_referenced_locally
	let comments = $state<NoteComment[]>(data.comments);
	let lang = $state('en');
	let contentClass = $state('max-w-2xl');
	let editing = $state(false);
	let editContent = $state('');
	let editVideo = $state('');
	let editDate = $state('');
	let editDateInitial = $state('');
	let editMaxDate = $state('');
	let editSaving = $state(false);
	let editError = $state('');
	let editField = $state<HTMLTextAreaElement | null>(null);
	const editUnchanged = $derived(
		editContent.trim() === withTrailingHashtags(note.content, note.tags).trim() &&
			editVideo.trim() === (note.video ? youTubeWatchUrl(note.video) : '') &&
			editDate === editDateInitial
	);
	const editEmpty = $derived(splitTrailingHashtags(editContent).content.trim().length === 0);
	let confirming = $state(false);
	let menuOpen = $state(false);
	let reading = $state(false);
	let addingComment = $state(false);
	let editingComment = $state<NoteComment | null>(null);
	let confirmingComment = $state<NoteComment | null>(null);

	$effect(() => {
		note = data.note;
		comments = data.comments;
	});

	onMount(() => {
		try {
			const raw = localStorage.getItem('fermentario.config');
			if (raw) {
				const c = JSON.parse(raw) as { entriesLang?: string; contentWidth?: string };
				if (c?.entriesLang) lang = c.entriesLang;
				contentClass = contentWidthClass(c?.contentWidth);
			}
		} catch {}
	});

	async function refresh() {
		const res = await loading.track(fetch(`/api/notes/${note.id}`));
		if (res.ok) note = ((await res.json()).note as Note) ?? note;
		const cres = await loading.track(fetch(`/api/notes/${note.id}/comments`));
		if (cres.ok) {
			const d = (await cres.json()) as { comments?: NoteComment[] };
			comments = d.comments ?? [];
		}
		await loading.track(invalidateAll());
	}

	async function addComment(text: string): Promise<boolean> {
		try {
			const res = await loading.track(fetch(`/api/notes/${note.id}/comments`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content: text })
			}));
			const d = await res.json();
			if (!res.ok) return false;
			comments = [...comments, d.comment as NoteComment];
			return true;
		} catch {
			return false;
		}
	}

	async function updateComment(c: NoteComment, text: string): Promise<boolean> {
		try {
			const res = await loading.track(fetch(`/api/notes/${note.id}/comments/${c.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content: text })
			}));
			const d = await res.json();
			if (!res.ok) return false;
			comments = comments.map((x) => (x.id === c.id ? (d.comment as NoteComment) : x));
			return true;
		} catch {
			return false;
		}
	}

	async function deleteComment(c: { id: string }) {
		const res = await loading.track(fetch(`/api/notes/${note.id}/comments/${c.id}`, { method: 'DELETE' }));
		if (!res.ok) {
			showToast('Failed to delete comment.');
			return;
		}
		comments = comments.filter((x) => x.id !== c.id);
		await refresh();
	}

	function focusEditor(node: HTMLTextAreaElement) {
		node.focus();
		node.setSelectionRange(node.value.length, node.value.length);
		node.style.height = 'auto';
		node.style.height = `${node.scrollHeight}px`;
	}

	function autosizeEditor() {
		if (!editField) return;
		editField.style.height = 'auto';
		editField.style.height = `${editField.scrollHeight}px`;
	}

	async function saveEdit() {
		if (editSaving || editEmpty || editUnchanged) return;
		editSaving = true;
		editError = '';
		try {
			const createdAt = editDate === editDateInitial
				? note.created_at
				: Math.min(datetimeLocalTimestamp(editDate) ?? Date.now(), Date.now());
			const res = await loading.track(fetch(`/api/notes/${note.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content: editContent.trim(), video: editVideo.trim(), created_at: createdAt })
			}));
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to save note.');
			editing = false;
			await refresh();
		} catch (e) {
			editError = (e as Error)?.message ?? 'Could not save the note.';
		} finally {
			editSaving = false;
		}
	}

	function cancelEdit() {
		if (editSaving) return;
		editing = false;
		editError = '';
	}

	async function remove() {
		const res = await loading.track(fetch(`/api/notes/${note.id}`, { method: 'DELETE' }));
		if (!res.ok) {
			showToast('Failed to delete note.');
			return;
		}
		await loading.track(invalidateAll());
		await goto('/');
	}

	async function removeTag(tag: string) {
		const res = await loading.track(fetch(`/api/notes/${note.id}/tags/${encodeURIComponent(tag)}`, { method: 'DELETE' }));
		if (!res.ok) {
			showToast('Failed to remove the tag.');
			return;
		}
		await refresh();
	}

	async function toggleFeature() {
		menuOpen = false;
		const res = await loading.track(fetch(`/api/notes/${note.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ featured: !note.featured })
		}));
		if (!res.ok) {
			showToast('Failed to update note.');
			return;
		}
		await refresh();
	}

	async function copy() {
		menuOpen = false;
		try {
			if (!navigator.clipboard) throw new Error('clipboard unavailable');
			await navigator.clipboard.writeText(note.content);
		} catch {
			showToast('Could not copy — clipboard unavailable.');
		}
	}

	function read() {
		menuOpen = false;
		if (reading) {
			window.speechSynthesis.cancel();
			reading = false;
			return;
		}
		const u = new SpeechSynthesisUtterance(note.content);
		u.rate = 0.98;
		u.lang = lang === 'es' ? 'es-ES' : lang === 'pt' ? 'pt-PT' : 'en-US';
		u.onend = () => (reading = false);
		u.onerror = () => (reading = false);
		reading = true;
		window.speechSynthesis.speak(u);
	}

	function openEdit() {
		menuOpen = false;
		editContent = withTrailingHashtags(note.content, note.tags);
		// Prefill the URL, not the stored id: the id would fail the API's URL
		// check on a text-only edit.
		editVideo = note.video ? youTubeWatchUrl(note.video) : '';
		editDate = datetimeLocalValue(note.created_at);
		editDateInitial = editDate;
		editMaxDate = datetimeLocalValue(Date.now());
		editError = '';
		editing = true;
	}
</script>

<svelte:head>
	<title>{note.content.slice(0, 40)} · fermentario</title>
</svelte:head>

<main class="min-h-dvh">
	<div class="mx-auto {contentClass} px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-24">
		<header class="mb-5">
			<a href="/" class="inline-flex items-center gap-1 text-xs font-medium text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200">
				<ArrowLeft class="h-3.5 w-3.5" /> All notes
			</a>
			<EntityTitle label="Note" id={note.id} />
			<p class="mt-1 text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
				{new Date(note.created_at).toLocaleString(lang === 'es' ? 'es-ES' : lang === 'pt' ? 'pt-PT' : 'en-US', {
					weekday: 'long',
					day: 'numeric',
					month: 'long',
					year: 'numeric',
					hour: '2-digit',
					minute: '2-digit'
				})}
				{#if note.updated_at > note.created_at}· edited{/if}
			</p>
		</header>

		<article class="relative rounded-2xl border bg-white/70 dark:bg-stone-900/70 px-4 py-3 {note.featured ? 'border-amber-400' : 'border-stone-200/80 dark:border-stone-800/80'}">
			<div class="flex items-start gap-2">
				{#if note.featured}<Star class="mt-1 h-4 w-4 shrink-0 fill-amber-400 text-amber-400" aria-label="Featured" />{/if}
				<div class="min-w-0 flex-1">
					{#if editing}
						<textarea
							bind:this={editField}
							use:focusEditor
							class="max-h-[50dvh] w-full resize-none overflow-y-auto rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-[15px] leading-snug text-stone-800 dark:text-stone-200 outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-stone-400 dark:focus:border-stone-600"
							aria-label="Note text"
							placeholder="Note text"
							value={editContent}
							oninput={(e) => { editContent = e.currentTarget.value; autosizeEditor(); }}
							onkeydown={(e) => {
								if (e.key === 'Escape') {
									e.preventDefault();
									cancelEdit();
								} else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
									e.preventDefault();
									void saveEdit();
								}
							}}
						></textarea>
						<label class="mt-3 block text-xs font-medium text-stone-500 dark:text-stone-400" for="edit-note-date">Date and time</label>
						<input
							id="edit-note-date"
							type="datetime-local"
							class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-sm text-stone-800 dark:text-stone-200 outline-none focus:border-stone-400 dark:focus:border-stone-600"
							bind:value={editDate}
							max={editMaxDate}
						/>
						<p class="mt-1 text-[11px] text-stone-400 dark:text-stone-500">Empty uses the current time.</p>
						<label class="mt-3 block text-xs font-medium text-stone-500 dark:text-stone-400" for="edit-note-video">YouTube URL (optional)</label>
						<input
							id="edit-note-video"
							class="mt-1 w-full rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 p-3 text-sm text-stone-800 dark:text-stone-200 outline-none placeholder:text-stone-400 dark:placeholder:text-stone-500 focus:border-stone-400 dark:focus:border-stone-600"
							value={editVideo}
							oninput={(e) => (editVideo = e.currentTarget.value)}
							placeholder="https://www.youtube.com/watch?v=…"
							inputmode="url"
						/>
						{#if editError}
							<p class="mt-2 text-xs text-rose-500 dark:text-rose-400">{editError}</p>
						{/if}
						<div class="mt-4 flex justify-end gap-2">
							<button
								type="button"
								class="rounded-full border border-stone-200 dark:border-stone-800 px-4 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-50"
								disabled={editSaving}
								onclick={cancelEdit}
							>{editSaving ? 'Saving…' : 'Cancel'}</button>
							<button
								type="button"
								class="rounded-full bg-stone-900 dark:bg-stone-700 px-4 py-1.5 text-xs font-medium text-white hover:bg-stone-800 dark:hover:bg-stone-600 disabled:opacity-50"
								disabled={editSaving || editEmpty || editUnchanged}
								onclick={() => void saveEdit()}
							>{editSaving ? 'Saving…' : 'Save'}</button>
						</div>
					{:else}
						<p class="whitespace-pre-wrap text-[15px] font-semibold leading-snug text-stone-800 dark:text-stone-200">{@html inlineMarkdown(note.content)}</p>
					{/if}
				</div>
				{#if !editing}
					<button
						type="button"
						class="max-sm:absolute max-sm:top-1 max-sm:right-2 max-sm:bg-white/90 dark:max-sm:bg-stone-900/90 grid h-9 w-9 shrink-0 place-items-center rounded-full text-stone-300 dark:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300"
						aria-label="Note actions"
						onclick={() => (menuOpen = true)}
					>
						<EllipsisVertical class="h-5 w-5" />
					</button>
				{/if}
			</div>
			{#if !editing && (note.tags ?? []).length > 0}
				<div class="mt-2 flex flex-wrap gap-1">
					{#each note.tags ?? [] as tag (tag)}
						<TagChip {tag} onRemove={removeTag} />
					{/each}
				</div>
			{/if}
			{#if !editing && note.video}
				<div class="mt-2"><VideoPill id={note.video} /></div>
			{/if}
		</article>

		<section class="mt-6" aria-label="Comments on this note">
			<div class="mb-1 flex items-center justify-between gap-2">
				<h2 class="text-xs font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500">Comments</h2>
				<button
					type="button"
					class="inline-flex items-center gap-1 rounded-full border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-1 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
					aria-haspopup="dialog"
					onclick={() => (addingComment = true)}
				><MessageCircle class="h-3.5 w-3.5" /> Add comment</button>
			</div>
			{#if comments.length === 0}
				<p class="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 px-4 py-6 text-center text-sm text-stone-500 dark:text-stone-400">
					No comments yet — narrate how this note evolves.
				</p>
			{:else}
				<ul class="space-y-2">
					{#each comments as c (c.id)}
						<CommentItem
							content={c.content}
							date={new Date(c.created_at).toLocaleDateString(lang === 'es' ? 'es-ES' : lang === 'pt' ? 'pt-PT' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
							onEdit={() => (editingComment = c)}
							onDelete={() => (confirmingComment = c)}
						/>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</main>

{#if addingComment}
	<CommentModal
		onSubmit={addComment}
		onClose={() => (addingComment = false)}
	/>
{/if}

{#if editingComment}
	{@const c = editingComment}
	<CommentModal
		title="Edit comment"
		placeholder="Edit comment…"
		submitLabel="Save"
		successMessage="Comment updated."
		initial={c.content}
		onSubmit={(text) => updateComment(c, text)}
		onClose={() => (editingComment = null)}
	/>
{/if}

{#if confirmingComment}
	<ConfirmDialog
		title="Delete this comment?"
		message="The comment is removed from this note only. Everything else stays."
		confirmLabel="Delete comment"
		cancelLabel="Cancel"
		confirmTone="danger"
		onConfirm={() => { const c = confirmingComment; confirmingComment = null; if (c) void deleteComment(c); }}
		onCancel={() => (confirmingComment = null)}
	/>
{/if}

{#if menuOpen}
	<NoteActionsMenu
		{note}
		onListen={read}
		onEdit={openEdit}
		onDelete={() => { menuOpen = false; confirming = true; }}
		onFeature={toggleFeature}
		onClose={() => (menuOpen = false)}
	/>
{/if}

{#if confirming}
	<ConfirmDialog
		title="Delete this note?"
		message="This will permanently remove the entry. You cannot undo this."
		confirmLabel="Delete"
		cancelLabel="Cancel"
		confirmTone="danger"
		onConfirm={() => void remove()}
		onCancel={() => (confirming = false)}
	/>
{/if}

