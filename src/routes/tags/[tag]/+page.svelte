<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import MessageCircle from '@lucide/svelte/icons/message-circle';
	import Timeline from '$lib/components/Timeline.svelte';
	import { NotePager } from '$lib/note-pager.svelte';
	import { loading } from '$lib/loading.svelte';
	import { showToast } from '$lib/toast.svelte';
	import { tagColors } from '$lib/tag-colors.svelte';
	import TagColorModal from '$lib/components/TagColorModal.svelte';
	import { contentWidthClass } from '$lib/display';
	import type { Note, TodoItem, Principle } from '$lib/types';

	let { data } = $props();
	const pager = new NotePager();
	pager.featured = 'exclude';
	let pinned = $state<Note[]>([]);
	let todoItems = $state<TodoItem[]>([]);
	let principleItems = $state<Principle[]>([]);
	let lang = $state('en');
	let contentClass = $state('max-w-2xl');
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
		principleItems = data.principleItems ?? [];
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

	async function remove(id: string) {
		try {
			const res = await loading.track(fetch(`/api/notes/${id}`, { method: 'DELETE' }));
			if (!res.ok) throw new Error('Failed to delete note.');
			pager.remove(id);
			pinned = pinned.filter((n) => n.id !== id);
		} catch (e) {
			showToast((e as Error)?.message ?? 'Failed to delete note.');
		}
	}

	async function feature(n: Note) {
		try {
			const res = await loading.track(fetch(`/api/notes/${n.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ featured: !n.featured })
			}));
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
			showToast((e as Error)?.message ?? 'Failed to update note.');
		}
	}

	async function toggleTodo(item: TodoItem) {
		try {
			const res = await loading.track(fetch(`/api/todo/items/${item.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ done: !item.done })
			}));
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to update item.');
			todoItems = todoItems.map((x) => (x.id === item.id ? d.item : x));
		} catch (e) {
			showToast((e as Error)?.message ?? 'Failed to update item.');
		}
	}

	async function removeTag(noteId: string, tag: string) {
		try {
			const res = await loading.track(fetch(
				`/api/notes/${noteId}/tags/${encodeURIComponent(tag)}`,
				{ method: 'DELETE' }
			));
			if (!res.ok) throw new Error('Failed to remove the tag.');
			// Removing the tag this page filters by takes the note out of the list.
			pager.remove(noteId);
		} catch (e) {
			showToast((e as Error)?.message ?? 'Failed to remove the tag.');
		}
	}

	async function edit(id: string, content: string, video?: string) {
		try {
			const body: { content: string; video?: string } = { content };
			if (video !== undefined) body.video = video;
			const res = await loading.track(fetch(`/api/notes/${id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			}));
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to save note.');
			const note = d.note as Note;
			// An edit that drops the tag removes the note from this page.
			if (pager.hasTag(note)) pager.patch(note);
			else pager.remove(id);
			pinned = pinned.map((x) => (x.id === note.id ? note : x));
		} catch (e) {
			showToast((e as Error)?.message ?? 'Failed to save note.');
			throw e;
		}
	}
</script>

<svelte:head>
	<title>#{data.tag} · fermentario</title>
</svelte:head>

<main class="min-h-dvh">
	<div class="mx-auto {contentClass} px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-24">
		<header class="mb-5">
			<a href="/" class="inline-flex items-center gap-1 text-xs font-medium text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200">
				<ArrowLeft class="h-3.5 w-3.5" /> All notes
			</a>
			<h1 class="mt-3 flex items-center gap-2 text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
				<button
					type="button"
					class="grid h-6 w-6 shrink-0 place-items-center rounded-full hover:bg-stone-100 dark:hover:bg-stone-800"
					aria-label="Change color of #{data.tag}"
					title="Change color"
					onclick={() => (colorOpen = true)}
				><span class="h-4 w-4 rounded-full {tagColors.dot(data.tag)}"></span></button>
				#{data.tag}
			</h1>
			<p class="mt-1 text-sm text-stone-500 dark:text-stone-400">
				{pager.count}
				{pager.count === 1 ? 'note' : 'notes'} with this tag{#if todoItems.length > 0} · {todoItems.length} {todoItems.length === 1 ? 'to-do' : 'to-dos'}{/if}
			</p>
		</header>

		{#if pinned.length > 0}
			<section class="mb-5" aria-label="Featured notes">
				<h2 class="mb-1 text-xs font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500">Featured</h2>
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

		{#if pager.notes.length === 0 && pinned.length === 0 && todoItems.length === 0 && principleItems.length === 0}
			<p class="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 px-4 py-6 text-center text-sm text-stone-500 dark:text-stone-400">
				No notes carry this tag yet.
			</p>
		{:else}
			{#if pager.notes.length > 0}
				<section class="mb-5" aria-label="Notes with this tag">
					<h2 class="mb-1 text-xs font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500">Notes</h2>
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
					<h2 class="mb-1 text-xs font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500">To-Do</h2>
					<ul class="space-y-2">
						{#each todoItems as item (item.id)}
							<li class="flex items-start gap-2.5 rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-4 py-2.5">
								<button
									type="button"
									role="checkbox"
									aria-checked={item.done}
									aria-label={item.done ? 'Mark not done' : 'Mark done'}
									class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border {item.done ? 'border-stone-900 dark:border-stone-700 bg-stone-900 dark:bg-stone-700 text-white' : 'border-stone-300 dark:border-stone-700 text-transparent'}"
									onclick={() => void toggleTodo(item)}
								><span class="text-[11px] leading-none">✓</span></button>
								<span class="min-w-0 flex-1">
									<button type="button" class="block w-full text-left whitespace-pre-wrap text-[15px] {item.done ? 'text-stone-400 dark:text-stone-500 line-through' : 'text-stone-800 dark:text-stone-200'}" onclick={() => void goto(`/todo/${item.id}`)}>{item.content}</button>
									{#if item.inProgress}
										<span class="mt-1 inline-block rounded-full bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-200">In progress</span>
									{/if}
									{#if (item.commentCount ?? 0) > 0}
										<span class="mt-1 inline-flex items-center gap-1 rounded-full bg-stone-100 dark:bg-stone-800 px-2 py-0.5 text-[11px] tabular-nums text-stone-500 dark:text-stone-400"><MessageCircle class="h-3 w-3" /> {item.commentCount}</span>
									{/if}
								</span>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
			{#if principleItems.length > 0}
				<section class="mt-5" aria-label="Principles with this tag">
					<h2 class="mb-1 text-xs font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500">Principles</h2>
					<ol class="space-y-2">
						{#each principleItems as p (p.id)}
							<li class="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-4 py-2.5 text-[15px] text-stone-800 dark:text-stone-200">{p.content}</li>
						{/each}
					</ol>
				</section>
			{/if}
		{/if}
	</div>
</main>

{#if colorOpen}
	<TagColorModal tag={data.tag} onClose={() => (colorOpen = false)} />
{/if}

