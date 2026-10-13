<script lang="ts">
	import { onMount } from 'svelte';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Timeline from '$lib/components/Timeline.svelte';
	import { NotePager } from '$lib/note-pager.svelte';
	import { tagColors } from '$lib/tag-colors.svelte';
	import TagColorModal from '$lib/components/TagColorModal.svelte';
	import { contentWidthClass } from '$lib/display';
	import type { Note, TodoItem } from '$lib/types';

	let { data } = $props();
	const pager = new NotePager();
	pager.featured = 'exclude';
	let pinned = $state<Note[]>([]);
	let todoItems = $state<TodoItem[]>([]);
	let lang = $state('en');
	let contentClass = $state('max-w-2xl');
	let err = $state('');
	let colorOpen = $state(false);

	$effect(() => {
		pager.seed({
			notes: data.notes,
			count: data.count,
			hasMore: data.hasMore,
			nextCursor: data.nextCursor,
			tag: data.tag
		});
		pinned = data.pinned ?? [];
		todoItems = data.todoItems ?? [];
	});

	onMount(() => {
		void tagColors.load();
		try {
			const raw = localStorage.getItem('fermentario.config');
			if (raw) {
				const c = JSON.parse(raw) as { entriesLang?: string; contentWidth?: string };
				if (c?.entriesLang) lang = c.entriesLang;
				contentClass = contentWidthClass(c?.contentWidth);
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
			pinned = pinned.filter((n) => n.id !== id);
		} catch (e) {
			fail(e, 'Failed to delete note.');
		}
	}

	async function feature(n: Note) {
		try {
			const res = await fetch(`/api/notes/${n.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ featured: !n.featured })
			});
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to update note.');
			const saved = d.note as Note;
			if (saved.featured) {
				pager.remove(n.id);
				pinned = [saved, ...pinned.filter((x) => x.id !== saved.id)];
			} else {
				pinned = pinned.filter((x) => x.id !== saved.id);
				pager.prepend(saved);
			}
		} catch (e) {
			fail(e, 'Failed to update note.');
		}
	}

	async function toggleTodo(item: TodoItem) {
		try {
			const res = await fetch(`/api/todo/items/${item.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ done: !item.done })
			});
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to update item.');
			todoItems = todoItems.map((x) => (x.id === item.id ? d.item : x));
		} catch (e) {
			fail(e, 'Failed to update item.');
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

	async function edit(id: string, content: string, video?: string) {
		try {
			const body: { content: string; video?: string } = { content };
			if (video !== undefined) body.video = video;
			const res = await fetch(`/api/notes/${id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			});
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to save note.');
			const note = d.note as Note;
			// An edit that drops the tag removes the note from this page.
			if (pager.hasTag(note)) pager.patch(note);
			else pager.remove(id);
			pinned = pinned.map((x) => (x.id === note.id ? note : x));
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
	<div class="mx-auto {contentClass} px-6 pt-14 pb-24">
		<header class="mb-5">
			<a href="/" class="inline-flex items-center gap-1 text-xs font-medium text-stone-500 hover:text-stone-800">
				<ArrowLeft class="h-3.5 w-3.5" /> All notes
			</a>
			<h1 class="mt-3 flex items-center gap-2 text-2xl font-semibold tracking-tight text-stone-900">
				<button
					type="button"
					class="grid h-6 w-6 shrink-0 place-items-center rounded-full hover:bg-stone-100"
					aria-label="Change color of #{data.tag}"
					title="Change color"
					onclick={() => (colorOpen = true)}
				><span class="h-4 w-4 rounded-full {tagColors.dot(data.tag)}"></span></button>
				#{data.tag}
			</h1>
			<p class="mt-1 text-sm text-stone-500">
				{pager.count}
				{pager.count === 1 ? 'note' : 'notes'} with this tag{#if todoItems.length > 0} · {todoItems.length} {todoItems.length === 1 ? 'to-do' : 'to-dos'}{/if}
			</p>
		</header>

		{#if pinned.length > 0}
			<section class="mb-5" aria-label="Featured notes">
				<h2 class="mb-1 text-xs font-medium uppercase tracking-widest text-stone-400">Featured</h2>
				<Timeline
					notes={pinned}
					summaryLoading={false}
					onDelete={remove}
					onEdit={edit}
					onFeature={feature}
					onLoadMore={() => pager.loadMore()}
					hasMore={false}
					loadingMore={false}
					onRemoveTag={removeTag}
					{lang}
				/>
			</section>
		{/if}

		{#if pager.notes.length === 0 && pinned.length === 0 && todoItems.length === 0}
			<p class="rounded-2xl border border-dashed border-stone-300 px-4 py-6 text-center text-sm text-stone-500">
				No notes carry this tag yet.
			</p>
		{:else}
			{#if pager.notes.length > 0}
				<section class="mb-5" aria-label="Notes with this tag">
					<h2 class="mb-1 text-xs font-medium uppercase tracking-widest text-stone-400">Notes</h2>
					<Timeline
						notes={pager.notes}
						summaryLoading={false}
						onDelete={remove}
						onEdit={edit}
						onFeature={feature}
						onLoadMore={() => pager.loadMore()}
						hasMore={pager.hasMore}
						loadingMore={pager.loading}
						onRemoveTag={removeTag}
						{lang}
					/>
				</section>
			{/if}
			{#if todoItems.length > 0}
				<section aria-label="To-do items with this tag">
					<h2 class="mb-1 text-xs font-medium uppercase tracking-widest text-stone-400">To-Do</h2>
					<ul class="space-y-2">
						{#each todoItems as item (item.id)}
							<li class="flex items-start gap-2.5 rounded-2xl border border-stone-200 bg-white px-4 py-2.5">
								<button
									type="button"
									role="checkbox"
									aria-checked={item.done}
									aria-label={item.done ? 'Mark not done' : 'Mark done'}
									class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border {item.done ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 text-transparent'}"
									onclick={() => void toggleTodo(item)}
								><span class="text-[11px] leading-none">✓</span></button>
								<span class="min-w-0 flex-1 text-[15px] {item.done ? 'text-stone-400 line-through' : 'text-stone-800'}">{item.content}</span>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
		{/if}
	</div>
</main>

{#if colorOpen}
	<TagColorModal tag={data.tag} onClose={() => (colorOpen = false)} />
{/if}

{#if err}
	<div class="pointer-events-none fixed inset-x-0 bottom-10 z-30 flex justify-center px-6">
		<p class="rounded-full bg-rose-50 px-4 py-1.5 text-xs text-rose-600 shadow-sm">{err}</p>
	</div>
{/if}
