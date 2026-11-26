<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import MessageCircle from '@lucide/svelte/icons/message-circle';
	import Timer from '@lucide/svelte/icons/timer';
	import Timeline from '$lib/components/Timeline.svelte';
	import { NotePager } from '$lib/note-pager.svelte';
	import { loading } from '$lib/loading.svelte';
	import { showToast } from '$lib/toast.svelte';
	import { invalidateTagChoices } from '$lib/tag-suggest';
	import { tagColors } from '$lib/tag-colors.svelte';
	import TagColorModal from '$lib/components/TagColorModal.svelte';
	import TagChip from '$lib/components/TagChip.svelte';
	import { contentWidthClass } from '$lib/display';
	import { dayLocale } from '$lib/dates';
	import { formatDuration } from '$lib/time-tracker.svelte';
	import type { Note, TodoItem, Principle, TimeEntry } from '$lib/types';

	let { data } = $props();
	const pager = new NotePager();
	pager.featured = 'exclude';
	let pinned = $state<Note[]>([]);
	let todoItems = $state<TodoItem[]>([]);
	let principleItems = $state<Principle[]>([]);
	let timeEntries = $state<TimeEntry[]>([]);
	let lang = $state('en');
	let contentClass = $state('max-w-2xl');
	let colorOpen = $state(false);

	type TagView = 'all' | 'featured' | 'notes' | 'time' | 'todo' | 'principles';
	let view = $state<TagView | null>(null);

	const groups = $derived(
		[
			{ id: 'featured' as const, label: 'Featured', count: pinned.length },
			{ id: 'notes' as const, label: 'Notes', count: pager.count },
			{ id: 'time' as const, label: 'Time', count: timeEntries.length },
			{ id: 'todo' as const, label: 'To-Do', count: todoItems.length },
			{ id: 'principles' as const, label: 'Principles', count: principleItems.length }
		].filter((s) => s.count > 0)
	);
	const total = $derived(groups.reduce((sum, s) => sum + s.count, 0));
	const sections = $derived(
		total > 0 ? [{ id: 'all' as const, label: 'All', count: total }, ...groups] : []
	);
	const active = $derived(sections.find((s) => s.id === view)?.id ?? 'all');

	$effect(() => {
		if (view && !sections.some((s) => s.id === view)) view = null;
	});

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
		timeEntries = data.timeEntries ?? [];
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

	async function publish(n: Note) {
		try {
			const res = await loading.track(fetch(`/api/notes/${n.id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ published: !n.published })
			}));
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to update note.');
			const saved = d.note as Note;
			pager.patch(saved);
			pinned = pinned.map((x) => (x.id === saved.id ? saved : x));
			showToast(saved.published ? 'Note published.' : 'Note unpublished.', 'success');
		} catch (e) {
			showToast((e as Error)?.message ?? 'Failed to update note.');
		}
	}

	function cover(n: Note, coverId: string | null) {
		pager.patch({ ...n, coverId });
		pinned = pinned.map((x) => (x.id === n.id ? { ...x, coverId } : x));
	}

	function fmtWhen(at: number): string {
		return new Date(at).toLocaleString(dayLocale(lang), {
			day: 'numeric',
			month: 'short',
			hour: '2-digit',
			minute: '2-digit'
		});
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

	async function edit(id: string, content: string, video?: string, createdAt?: number, title?: string) {
		try {
			const body: { content: string; video?: string; created_at?: number; title?: string } = { content };
			if (video !== undefined) body.video = video;
			if (createdAt !== undefined) body.created_at = createdAt;
			if (title !== undefined) body.title = title;
			const res = await loading.track(fetch(`/api/notes/${id}`, {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(body)
			}));
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to save note.');
			const note = d.note as Note;
			// An edit that drops the tag removes the note from this page.
			if (pager.hasTag(note)) {
				const wasLoaded = pager.notes.some((n) => n.id === note.id);
				if (wasLoaded && !pager.replaceSorted(note)) {
					showToast('Note saved. Scroll down to find it.', 'success');
				}
				invalidateTagChoices();
				pinned = pinned
					.map((x) => (x.id === note.id ? note : x))
					.sort((a, b) => b.created_at - a.created_at);
			} else {
				pager.remove(id);
				pinned = pinned.filter((x) => x.id !== id);
			}
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
			<button
				type="button"
				class="inline-flex items-center gap-1 text-xs font-medium text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-stone-200"
				onclick={() => { if (window.history.length > 1) window.history.back(); else void goto('/admin/tags'); }}
			>
				<ArrowLeft class="h-3.5 w-3.5" /> Back
			</button>
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
				{pager.count === 1 ? 'note' : 'notes'} with this tag{#if todoItems.length > 0} · {todoItems.length} {todoItems.length === 1 ? 'to-do' : 'to-dos'}{/if}{#if timeEntries.length > 0} · {timeEntries.length} {timeEntries.length === 1 ? 'time entry' : 'time entries'}{/if}
			</p>
		</header>

		{#if sections.length > 0}
			<div
				class="no-scrollbar -mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-1"
				role="tablist"
				aria-label="Tag sections"
			>
				{#each sections as section (section.id)}
					<button
						type="button"
						role="tab"
						aria-selected={active === section.id}
						class="inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium select-none {active === section.id
							? 'bg-stone-900 text-white dark:bg-stone-700'
							: 'text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800'}"
						onclick={() => (view = section.id)}
					>{section.label}<span
							class="tabular-nums {active === section.id
								? 'text-white/70'
								: 'text-stone-400 dark:text-stone-500'}">{section.count}</span
						></button
					>
				{/each}
			</div>
		{/if}

		{#if pinned.length > 0 && (active === 'all' || active === 'featured')}
			<section class="mb-5" aria-label="Featured notes">
				<h2 class="mb-1 text-xs font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500">Featured</h2>
				<Timeline
					notes={pinned}
					onDelete={remove}
					onEdit={edit}
					onFeature={feature}
					onPublish={publish}
					onCover={cover}
					onLoadMore={() => pager.loadMore()}
					hasMore={false}
					loadingMore={false}
					onRemoveTag={removeTag}
					{lang}
				/>
			</section>
		{/if}

		{#if sections.length === 0}
			<p class="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 px-4 py-6 text-center text-sm text-stone-500 dark:text-stone-400">
				Nothing carries this tag yet.
			</p>
		{:else}
			{#if pager.notes.length > 0 && (active === 'all' || active === 'notes')}
				<section class="mb-5" aria-label="Notes with this tag">
					<h2 class="mb-1 text-xs font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500">Notes</h2>
					<Timeline
						notes={pager.notes}
						onDelete={remove}
						onEdit={edit}
						onFeature={feature}
						onPublish={publish}
						onCover={cover}
						onLoadMore={() => pager.loadMore()}
						hasMore={pager.hasMore}
						loadingMore={pager.loading}
						onRemoveTag={removeTag}
						{lang}
					/>
				</section>
			{/if}
			{#if timeEntries.length > 0 && (active === 'all' || active === 'time')}
				<section class="mb-5" aria-label="Time entries with this tag">
					<h2 class="mb-1 text-xs font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500">Time</h2>
					<ul class="space-y-2">
						{#each timeEntries as entry (entry.id)}
							<li class="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-4 py-2.5">
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0 flex-1">
										<p class="text-[15px] text-stone-800 dark:text-stone-200">{entry.comment || 'No comment'}</p>
										{#if entry.tags?.length}
											<div class="mt-1 flex flex-wrap gap-1">
												{#each entry.tags as tag (tag)}
													<TagChip {tag} picker={false} />
												{/each}
											</div>
										{/if}
										<p class="mt-0.5 text-[11px] text-stone-400 dark:text-stone-500">
											{fmtWhen(entry.startedAt)}{#if entry.endedAt} · {fmtWhen(entry.endedAt)}{/if}
										</p>
									</div>
									<div class="shrink-0 text-right">
										{#if entry.endedAt}
											<p class="font-mono text-sm font-medium tabular-nums text-stone-900 dark:text-stone-100">{formatDuration(entry.endedAt - entry.startedAt)}</p>
										{:else}
											<span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
												<Timer class="h-3 w-3" /> Running
											</span>
										{/if}
									</div>
								</div>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
			{#if todoItems.length > 0 && (active === 'all' || active === 'todo')}
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
									<button type="button" class="block w-full text-left whitespace-pre-wrap text-[15px] {item.done ? 'text-stone-400 dark:text-stone-500 line-through' : 'text-stone-800 dark:text-stone-200'}" onclick={() => void goto(`/admin/todo/${item.id}`)}>{item.content}</button>
									{#if item.inProgress}
										<span class="mt-1 inline-block rounded-full bg-amber-100 dark:bg-amber-900/50 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:text-amber-200">In progress</span>
									{/if}
									{#if (item.commentCount ?? 0) > 0}
										<span class="mt-1 inline-flex items-center gap-1 rounded-full bg-stone-200 dark:bg-stone-700 px-2 py-0.5 text-[11px] tabular-nums text-stone-600 dark:text-stone-300"><MessageCircle class="h-3 w-3" /> {item.commentCount}</span>
									{/if}
								</span>
							</li>
						{/each}
					</ul>
				</section>
			{/if}
			{#if principleItems.length > 0 && (active === 'all' || active === 'principles')}
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
