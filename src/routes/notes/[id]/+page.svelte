<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, invalidateAll } from '$app/navigation';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import EllipsisVertical from '@lucide/svelte/icons/ellipsis-vertical';
	import Star from '@lucide/svelte/icons/star';
	import TagChip from '$lib/components/TagChip.svelte';
	import VideoEmbed from '$lib/components/VideoEmbed.svelte';
	import EditNoteDialog from '$lib/components/EditNoteDialog.svelte';
	import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
	import NoteActionsMenu from '$lib/components/NoteActionsMenu.svelte';
	import { contentWidthClass } from '$lib/display';
	import type { Note } from '$lib/types';

	let { data } = $props();
	// svelte-ignore state_referenced_locally
	let note = $state<Note>(data.note);
	let lang = $state('en');
	let contentClass = $state('max-w-2xl');
	let err = $state('');
	let editing = $state(false);
	let editContent = $state('');
	let editVideo = $state('');
	let confirming = $state(false);
	let menuOpen = $state(false);
	let reading = $state(false);

	$effect(() => {
		note = data.note;
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

	function fail(msg: string) {
		err = msg;
		setTimeout(() => (err = ''), 4000);
	}

	async function refresh() {
		const res = await fetch(`/api/notes/${note.id}`);
		if (res.ok) note = ((await res.json()).note as Note) ?? note;
		await invalidateAll();
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
	<div class="mx-auto {contentClass} px-6 pt-14 pb-24">
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

		<article class="rounded-2xl border border-stone-200/80 bg-white/70 px-4 py-3">
			<div class="flex items-start gap-2">
				{#if note.featured}<Star class="mt-1 h-4 w-4 shrink-0 fill-amber-400 text-amber-400" aria-label="Featured" />{/if}
				<p class="min-w-0 flex-1 whitespace-pre-wrap text-[15px] leading-snug text-stone-800">{note.content}</p>
				<button
					type="button"
					class="grid h-9 w-9 shrink-0 place-items-center rounded-full text-stone-300 hover:bg-stone-100 hover:text-stone-600"
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
				<div class="mt-2"><VideoEmbed id={note.video} /></div>
			{/if}
		</article>
	</div>
</main>

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
