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
	import EditNoteDialog from '$lib/components/EditNoteDialog.svelte';
	import CommentModal from '$lib/components/CommentModal.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import NoteActionsMenu from '$lib/components/NoteActionsMenu.svelte';
	import { contentWidthClass } from '$lib/display';
	import type { Note, NoteComment } from '$lib/types';

	let { data } = $props();
	// svelte-ignore state_referenced_locally
	let note = $state<Note>(data.note);
	// svelte-ignore state_referenced_locally
	let comments = $state<NoteComment[]>(data.comments);
	let lang = $state('en');
	let contentClass = $state('max-w-2xl');
	let err = $state('');
	let editing = $state(false);
	let editContent = $state('');
	let editVideo = $state('');
	let confirming = $state(false);
	let menuOpen = $state(false);
	let reading = $state(false);
	let addingComment = $state(false);
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
		const res = await fetch(`/api/notes/${note.id}`);
		if (res.ok) note = ((await res.json()).note as Note) ?? note;
		const cres = await fetch(`/api/notes/${note.id}/comments`);
		if (cres.ok) {
			const d = (await cres.json()) as { comments?: NoteComment[] };
			comments = d.comments ?? [];
		}
		await invalidateAll();
	}

	async function addComment(text: string): Promise<boolean> {
		try {
			const res = await fetch(`/api/notes/${note.id}/comments`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content: text })
			});
			const d = await res.json();
			if (!res.ok) return false;
			comments = [...comments, d.comment as NoteComment];
			return true;
		} catch {
			return false;
		}
	}

	async function deleteComment(c: { id: string }) {
		const res = await fetch(`/api/notes/${note.id}/comments/${c.id}`, { method: 'DELETE' });
		if (!res.ok) {
			fail('Failed to delete comment.');
			return;
		}
		comments = comments.filter((x) => x.id !== c.id);
		await refresh();
	}

	function fail(msg: string) {
		err = msg;
		setTimeout(() => (err = ''), 4000);
	}

	async function saveEdit(content: string, video: string) {
		const res = await fetch(`/api/notes/${note.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ content, video })
		});
		const d = await res.json();
		if (!res.ok) throw new Error(d?.error ?? 'Failed to save note.');
		editing = false;
		await refresh();
	}

	async function remove() {
		const res = await fetch(`/api/notes/${note.id}`, { method: 'DELETE' });
		if (!res.ok) {
			fail('Failed to delete note.');
			return;
		}
		await invalidateAll();
		await goto('/');
	}

	async function removeTag(tag: string) {
		const res = await fetch(`/api/notes/${note.id}/tags/${encodeURIComponent(tag)}`, { method: 'DELETE' });
		if (!res.ok) {
			fail('Failed to remove the tag.');
			return;
		}
		await refresh();
	}

	async function toggleFeature() {
		menuOpen = false;
		const res = await fetch(`/api/notes/${note.id}`, {
			method: 'PATCH',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ featured: !note.featured })
		});
		if (!res.ok) {
			fail('Failed to update note.');
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
			fail('Could not copy — clipboard unavailable.');
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
		editContent = note.content;
		editVideo = note.video ?? '';
		editing = true;
	}
</script>

<svelte:head>
	<title>{note.content.slice(0, 40)} · fermentario</title>
</svelte:head>

<main class="min-h-dvh">
	<div class="mx-auto {contentClass} px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-24">
		<header class="mb-5">
			<a href="/" class="inline-flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-stone-800">
				<ArrowLeft class="h-3.5 w-3.5" /> All notes
			</a>
			<p class="mt-3 text-[11px] tabular-nums text-stone-400">
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

		<article class="relative rounded-2xl border bg-white/70 px-4 py-3 {note.featured ? 'border-amber-400' : 'border-stone-200/80'}">
			<div class="flex items-start gap-2">
				{#if note.featured}<Star class="mt-1 h-4 w-4 shrink-0 fill-amber-400 text-amber-400" aria-label="Featured" />{/if}
				<div class="min-w-0 flex-1">
					<p class="whitespace-pre-wrap text-[15px] leading-snug text-stone-800">{@html inlineMarkdown(note.content)}</p>
				</div>
				<button
					type="button"
					class="max-sm:absolute max-sm:top-1 max-sm:right-2 max-sm:bg-white/90 grid h-9 w-9 shrink-0 place-items-center rounded-full text-stone-300 hover:bg-stone-100 hover:text-stone-600"
					aria-label="Note actions"
					onclick={() => (menuOpen = true)}
				>
					<EllipsisVertical class="h-5 w-5" />
				</button>
			</div>
			{#if (note.tags ?? []).length > 0}
				<div class="mt-2 flex flex-wrap gap-1">
					{#each note.tags ?? [] as tag (tag)}
						<TagChip {tag} onRemove={removeTag} />
					{/each}
				</div>
			{/if}
			{#if note.video}
				<div class="mt-2"><VideoPill id={note.video} /></div>
			{/if}
		</article>

		<section class="mt-6" aria-label="Comments on this note">
			<div class="mb-1 flex items-center justify-between gap-2">
				<h2 class="text-xs font-medium uppercase tracking-widest text-stone-400">Comments</h2>
				<button
					type="button"
					class="inline-flex items-center gap-1 rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100"
					aria-haspopup="dialog"
					onclick={() => (addingComment = true)}
				><MessageCircle class="h-3.5 w-3.5" /> Add comment</button>
			</div>
			{#if comments.length === 0}
				<p class="rounded-2xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-500">
					No comments yet — narrate how this note evolves.
				</p>
			{:else}
				<ul class="space-y-2">
					{#each comments as c (c.id)}
						<li class="rounded-2xl border border-stone-200 bg-white px-4 py-2.5">
							<p class="whitespace-pre-wrap text-[15px] leading-snug text-stone-800">{c.content}</p>
							<div class="mt-1 flex items-center justify-between gap-2">
								<span class="text-[11px] tabular-nums text-stone-400">
									{new Date(c.created_at).toLocaleDateString(lang === 'es' ? 'es-ES' : lang === 'pt' ? 'pt-PT' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
								</span>
								<button
									type="button"
									aria-label="Delete comment"
									class="shrink-0 text-stone-300 hover:text-rose-600"
									onclick={() => (confirmingComment = c)}
								>&times;</button>
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</div>
</main>

{#if addingComment}
	<CommentModal
		onAdd={addComment}
		onClose={() => (addingComment = false)}
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

{#if editing}
	<EditNoteDialog
		{note}
		content={editContent}
		video={editVideo}
		onContent={(v) => (editContent = v)}
		onVideo={(v) => (editVideo = v)}
		onSave={saveEdit}
		onCancel={() => (editing = false)}
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

{#if err}
	<div class="pointer-events-none fixed inset-x-0 bottom-10 z-30 flex justify-center px-6">
		<p class="rounded-full bg-rose-50 px-4 py-1.5 text-xs text-rose-600 shadow-sm">{err}</p>
	</div>
{/if}
