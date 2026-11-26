<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import Star from '@lucide/svelte/icons/star';
	import MessageCircle from '@lucide/svelte/icons/message-circle';
	import NoteBody from '$lib/components/NoteBody.svelte';
	import NoteEditorModal from '$lib/components/NoteEditorModal.svelte';
	import { youTubeWatchUrl } from '$lib/youtube';
	import CommentModal from '$lib/components/CommentModal.svelte';
	import CommentItem from '$lib/components/CommentItem.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import EntityTitle from '$lib/components/EntityTitle.svelte';
	import NoteActionsMenu from '$lib/components/NoteActionsMenu.svelte';
	import { contentWidthClass } from '$lib/display';
	import { sortComments } from '$lib/comments';
	import { withTrailingHashtags } from '$lib/hashtags';
	import { loading } from '$lib/loading.svelte';
	import { showToast } from '$lib/toast.svelte';
	import { preferredSpeechVoiceURI, speakText, speechStartedMessage, type SpeechLang } from '$lib/speech';
	import type { Note, NoteComment } from '$lib/types';

	let { data } = $props();
	// svelte-ignore state_referenced_locally
	let note = $state<Note>(data.note);
	// svelte-ignore state_referenced_locally
	let comments = $state<NoteComment[]>(data.comments);
	let lang = $state('en');
	let contentClass = $state('max-w-2xl');
	let editing = $state(false);
	let editTitle = $state('');
	let editContent = $state('');
	let editVideo = $state('');
	let confirming = $state(false);
	let menuOpen = $state(false);
	let reading = $state(false);
	let stopSpeech: (() => void) | null = null;
	let speechGeneration = 0;
	onDestroy(() => {
		speechGeneration += 1;
		stopSpeech?.();
	});
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
			comments = sortComments([d.comment as NoteComment, ...comments]);
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
			comments = sortComments(comments.map((x) => (x.id === c.id ? (d.comment as NoteComment) : x)));
			return true;
		} catch {
			return false;
		}
	}

	async function togglePin(c: NoteComment) {
		try {
			const res = await loading.track(fetch(`/api/notes/${note.id}/comments/${c.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ pinned: !c.pinned })
			}));
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to update comment.');
			comments = sortComments(comments.map((x) => (x.id === c.id ? (d.comment as NoteComment) : x)));
		} catch (e) {
			showToast((e as Error)?.message ?? 'Failed to update comment.');
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

	async function toggleMonospace(n: Note) {
		const res = await loading.track(fetch(`/api/notes/${n.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ monospace: !n.monospace })
		}));
		const d = await res.json();
		if (!res.ok) throw new Error(d?.error ?? 'Could not save note settings.');
		note = d.note as Note;
	}

	async function saveEdit(content: string, video: string, createdAt: number, cover: string | null | undefined, title: string) {
		try {
			const res = await loading.track(fetch(`/api/notes/${note.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content, title, video, created_at: createdAt })
			}));
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to save note.');
			if (cover !== undefined) {
				if (cover === null) {
					const coverRes = await loading.track(fetch(`/api/notes/${note.id}/photo`, { method: 'DELETE' }));
					if (!coverRes.ok) throw new Error('Could not remove the cover image.');
				} else {
					const pres = await loading.track(fetch(`/api/notes/${note.id}/photo`, {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ photo: cover })
					}));
					const pd = await pres.json();
					if (!pres.ok) throw new Error(pd?.error ?? 'Could not save the cover image.');
				}
			}
			editing = false;
			await refresh();
		} catch (e) {
			throw e;
		}
	}

	function cancelEdit() {
		editing = false;
	}

	async function remove() {
		const res = await loading.track(fetch(`/api/notes/${note.id}`, { method: 'DELETE' }));
		if (!res.ok) {
			showToast('Failed to delete note.');
			return;
		}
		await loading.track(invalidateAll());
		await goto('/admin/notes');
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

	async function togglePublish() {
		menuOpen = false;
		const res = await loading.track(fetch(`/api/notes/${note.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ published: !note.published })
		}));
		if (!res.ok) {
			showToast('Failed to update note.');
			return;
		}
		showToast(!note.published ? 'Note published.' : 'Note unpublished.', 'success');
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
		speechGeneration += 1;
		const generation = speechGeneration;
		if (reading) {
			stopSpeech?.();
			stopSpeech = null;
			reading = false;
			return;
		}
		const speechLang: SpeechLang = lang === 'es' || lang === 'pt' ? lang : 'en';
		const result = speakText(note.content, speechLang, preferredSpeechVoiceURI(), () => {
			if (speechGeneration === generation) showToast(speechStartedMessage(speechLang), 'success');
		}, () => {
			if (speechGeneration !== generation) return;
			reading = false;
			stopSpeech = null;
		}, (message) => {
			if (speechGeneration !== generation) return;
			reading = false;
			stopSpeech = null;
			showToast(message);
		});
		if (typeof result === 'string') {
			showToast(result);
			return;
		}
		stopSpeech = result;
		reading = true;
	}

	function openEdit() {
		menuOpen = false;
		editTitle = note.title ?? '';
		editContent = withTrailingHashtags(note.content, note.tags);
		// Prefill the URL, not the stored id: the id would fail the API's URL
		// check on a text-only edit.
		editVideo = note.video ? youTubeWatchUrl(note.video) : '';
		editing = true;
	}
</script>

<svelte:head>
	<title>{note.title || note.content.slice(0, 40)} · fermentario</title>
</svelte:head>

<main class="min-h-dvh">
	<div class="mx-auto {contentClass} px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-24">
		<header class="mb-5">
			<a href="/admin/notes" class="inline-flex items-center gap-1 text-xs font-medium text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200">
				<ArrowLeft class="h-3.5 w-3.5" /> All notes
			</a>
			<EntityTitle label="Note" id={note.id} />
			<p class="mt-1 flex flex-wrap items-center gap-2 text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
				<span>
					{new Date(note.created_at).toLocaleString(lang === 'es' ? 'es-ES' : lang === 'pt' ? 'pt-PT' : 'en-US', {
						weekday: 'long',
						day: 'numeric',
						month: 'long',
						year: 'numeric',
						hour: '2-digit',
						minute: '2-digit'
					})}
					{#if note.updated_at > note.created_at}· edited{/if}
				</span>
				{#if note.published}
					<span class="rounded-full bg-emerald-100 dark:bg-emerald-900/50 px-1.5 py-px text-[10px] font-medium text-emerald-700 dark:text-emerald-300">Published</span>
				{:else}
					<button
						type="button"
						class="rounded-full border border-stone-200 dark:border-stone-800 px-2 py-px text-[10px] font-medium text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800"
						onclick={() => void togglePublish()}
					>Publish</button>
				{/if}
			</p>
		</header>

		<article class="relative rounded-2xl border bg-white/70 dark:bg-stone-900/70 px-4 py-3 {note.featured ? 'border-amber-400' : 'border-stone-200/80 dark:border-stone-800/80'}">
			<div class="flex items-start gap-2">
				{#if note.featured}<Star class="mt-1 h-4 w-4 shrink-0 fill-amber-400 text-amber-400" aria-label="Featured" />{/if}
				<div class="min-w-0 flex-1">
					{#if !editing}
						<NoteBody
							{note}
							variant="page"
							removableTags
							onRemoveTag={removeTag}
							{lang}
						/>
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
							id={c.id}
							content={c.content}
							date={new Date(c.created_at).toLocaleDateString(lang === 'es' ? 'es-ES' : lang === 'pt' ? 'pt-PT' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
							pinned={c.pinned}
							onPin={() => void togglePin(c)}
							onEdit={() => (editingComment = c)}
							onDelete={() => (confirmingComment = c)}
						/>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</main>

{#if editing}
	<NoteEditorModal
		{note}
		title={editTitle}
		content={editContent}
		video={editVideo}
		coverId={note.coverId ?? null}
		onTitle={(value) => (editTitle = value)}
		onContent={(value) => (editContent = value)}
		onVideo={(value) => (editVideo = value)}
		onSave={saveEdit}
		onCancel={cancelEdit}
	/>
{/if}

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
		onPublish={togglePublish}
		onToggleMonospace={toggleMonospace}
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
