<script lang="ts">
	import { onMount } from 'svelte';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Timeline from '$lib/components/Timeline.svelte';
	import { NotePager } from '$lib/note-pager.svelte';
	import type { Note } from '$lib/types';

	let { data } = $props();
	const pager = new NotePager();
	let lang = $state('en');
	let err = $state('');

	$effect(() => {
		pager.seed({
			notes: data.notes,
			count: data.count,
			hasMore: data.hasMore,
			nextCursor: data.nextCursor,
			tag: data.tag
		});
	});

	onMount(() => {
		try {
			const raw = localStorage.getItem('fermentario.config');
			if (raw) {
				const c = JSON.parse(raw) as { entriesLang?: string };
				if (c?.entriesLang) lang = c.entriesLang;
			}
		} catch {}
	});

	function fail(e: unknown, fallback: string) {
		err = (e as Error)?.message ?? fallback;
		setTimeout(() => (err = ''), 4000);
	}

	async function remove(id: string) {
		try {
			const res = await fetch(`/api/notes/${id}`, { method: 'DELETE' });
			if (!res.ok) throw new Error('Failed to delete note.');
			pager.remove(id);
		} catch (e) {
			fail(e, 'Failed to delete note.');
		}
	}

	async function removeTag(noteId: string, tag: string) {
		try {
			const res = await fetch(
				`/api/notes/${noteId}/tags/${encodeURIComponent(tag)}`,
				{ method: 'DELETE' }
			);
			if (!res.ok) throw new Error('Failed to remove the tag.');
			// Removing the tag this page filters by takes the note out of the list.
			pager.remove(noteId);
		} catch (e) {
			fail(e, 'Failed to remove the tag.');
		}
	}

	async function edit(id: string, content: string) {
		try {
			const res = await fetch(`/api/notes/${id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ content })
			});
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to save note.');
			const note = d.note as Note;
			// An edit that drops the tag removes the note from this page.
			if (pager.hasTag(note)) pager.patch(note);
			else pager.remove(id);
		} catch (e) {
			fail(e, 'Failed to save note.');
			throw e;
		}
	}
</script>

<svelte:head>
	<title>#{data.tag} · fermentario</title>
</svelte:head>

<main class="min-h-dvh">
	<div class="mx-auto max-w-2xl px-6 pt-14 pb-24">
		<header class="mb-5">
			<a href="/" class="inline-flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-stone-800">
				<ArrowLeft class="h-3.5 w-3.5" /> All notes
			</a>
			<h1 class="mt-3 text-2xl font-semibold tracking-tight text-stone-900">#{data.tag}</h1>
			<p class="mt-1 text-sm text-stone-500">
				{pager.count}
				{pager.count === 1 ? 'note' : 'notes'} with this tag
			</p>
		</header>

		{#if pager.notes.length === 0}
			<p class="rounded-2xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-500">
				No notes carry this tag yet.
			</p>
		{:else}
			<Timeline
				notes={pager.notes}
				summaryLoading={false}
				onDelete={remove}
				onEdit={edit}
				onLoadMore={() => pager.loadMore()}
				hasMore={pager.hasMore}
				loadingMore={pager.loading}
				onRemoveTag={removeTag}
				{lang}
			/>
		{/if}
	</div>
</main>

{#if err}
	<div class="pointer-events-none fixed inset-x-0 bottom-10 z-30 flex justify-center px-6">
		<p class="rounded-full bg-rose-50 px-4 py-1.5 text-xs text-rose-600 shadow-sm">{err}</p>
	</div>
{/if}
