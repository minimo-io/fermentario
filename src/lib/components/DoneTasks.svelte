<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import { showToast } from '$lib/toast.svelte';
	import type { TodoDoneCursor, TodoDonePage, TodoProgressItem } from '$lib/types';

	type Props = { initial: TodoDonePage; lang?: string };
	let { initial, lang = 'en' }: Props = $props();

	type DoneMonth = { key: string; label: string; items: TodoProgressItem[] };

	// The route load seeds the first page. This component owns the rest of
	// the cursor and keeps the list mounted while the page scrolls.
	// svelte-ignore state_referenced_locally
	const seed = initial;
	let items = $state<TodoProgressItem[]>(seed.items);
	let count = $state(seed.count);
	let hasMore = $state(seed.hasMore);
	let cursor = $state<TodoDoneCursor | null>(seed.nextCursor);
	let loadingMore = $state(false);
	let failed = $state(false);
	let sentinel = $state<HTMLDivElement | null>(null);

	const locale = $derived(lang === 'es' ? 'es-ES' : lang === 'pt' ? 'pt-PT' : 'en-US');

	function monthKey(at: number): string {
		const d = new Date(at);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
	}

	function monthLabel(at: number): string {
		return new Date(at).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
	}

	const months = $derived.by((): DoneMonth[] => {
		const groups: DoneMonth[] = [];
		for (const item of items) {
			const key = item.done_at ? monthKey(item.done_at) : 'unknown';
			let group = groups[groups.length - 1];
			if (!group || group.key !== key) {
				group = {
					key,
					label: item.done_at ? monthLabel(item.done_at) : 'Date unavailable',
					items: []
				};
				groups.push(group);
			}
			group.items.push(item);
		}
		return groups;
	});

	function fmt(at: number): string {
		if (!at) return '';
		return new Date(at).toLocaleString(locale, {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	async function loadMore() {
		if (loadingMore || !hasMore || !cursor || failed) return;
		loadingMore = true;
		try {
			const q = new URLSearchParams({
				done: 'only',
				limit: '50',
				before: String(cursor.done_at),
				before_id: cursor.id
			});
			const res = await fetch(`/api/todo/items?${q.toString()}`);
			if (!res.ok) throw new Error('Failed to load done tasks.');
			const d = (await res.json()) as TodoDonePage;
			items = [...items, ...d.items];
			count = d.count;
			cursor = d.nextCursor;
			hasMore = d.hasMore;
		} catch {
			failed = true;
			showToast('Failed to load more done tasks.');
		} finally {
			loadingMore = false;
		}
	}

	// Re-create the observer after each page. If the sentinel is still in view,
	// the new observer fires at once and the next page loads; a one-shot
	// observer would stop after the first short list.
	$effect(() => {
		const el = sentinel;
		if (!el || !hasMore || loadingMore || failed) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) void loadMore();
			},
			{ rootMargin: '600px 0px' }
		);
		observer.observe(el);
		return () => observer.disconnect();
	});
</script>

<section class="mt-8" aria-labelledby="done-tasks-heading">
	<div class="mb-3 flex items-baseline justify-between gap-2">
		<h2 id="done-tasks-heading" class="text-xs font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500">Done tasks</h2>
		<span class="text-[11px] tabular-nums text-stone-400 dark:text-stone-500">{count} {count === 1 ? 'task' : 'tasks'}</span>
	</div>

	{#if items.length === 0}
		<p class="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 px-4 py-8 text-center text-sm text-stone-500 dark:text-stone-400">
			No tasks done yet.
		</p>
	{:else}
		{#each months as month (month.key)}
			<section class="mt-5 first:mt-0" aria-labelledby={`done-month-${month.key}`}>
				<h3 id={`done-month-${month.key}`} class="mb-2 text-xs font-medium uppercase tracking-widest text-stone-400 dark:text-stone-500">
					{month.label}
				</h3>
				<ul class="space-y-2">
					{#each month.items as item (item.id)}
						<li class="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-4 py-2.5">
							<div class="flex items-start gap-2.5">
								<span class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400">
									<Check class="h-3 w-3" />
								</span>
								<div class="min-w-0 flex-1">
									<a href={`/todo/${item.id}`} class="block whitespace-pre-wrap text-[15px] leading-snug text-stone-800 dark:text-stone-200 hover:text-stone-950 dark:hover:text-white">{item.content}</a>
									<p class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-stone-400 dark:text-stone-500">
										<span class="rounded-full bg-stone-100 dark:bg-stone-800 px-2 py-0.5 text-stone-500 dark:text-stone-400">{item.groupName}</span>
										{#if item.done_at}
											<span class="tabular-nums">done {fmt(item.done_at)}</span>
										{:else}
											<span>done date unavailable</span>
										{/if}
									</p>
								</div>
							</div>
						</li>
					{/each}
				</ul>
			</section>
		{/each}

		{#if hasMore}
			<div bind:this={sentinel} class="h-1" aria-hidden="true"></div>
		{/if}
		{#if loadingMore}
			<p class="py-3 text-center text-[11px] text-stone-400 dark:text-stone-500" role="status">Loading more…</p>
		{:else if failed}
			<button
				type="button"
				class="mx-auto mt-3 block rounded-full border border-stone-200 dark:border-stone-800 px-4 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
				onclick={() => (failed = false)}
			>Retry</button>
		{/if}
	{/if}
</section>
