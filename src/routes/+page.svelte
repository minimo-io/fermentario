<script lang="ts">
	import { onMount } from 'svelte';
	import CollapsibleSection from '$lib/components/CollapsibleSection.svelte';
	import NoteLinkPills from '$lib/components/NoteLinkPills.svelte';
	import TimeTrackerBar from '$lib/components/TimeTrackerBar.svelte';
	import { renderNoteContent } from '$lib/note-links';
	import { dayLocale } from '$lib/dates';
	import type { Note } from '$lib/types';
	import { timeTracker } from '$lib/time-tracker.svelte';

	// Public homepage: published notes only, server-rendered so crawlers see
	// HTML. Both year and month levels toggle with the shared
	// CollapsibleSection (slide 180 ms, remembered state). No composer, no
	// admin actions here. Older pages append client-side via the public API.
	let { data } = $props();
	// svelte-ignore state_referenced_locally
	let notes = $state<Note[]>(data.notes ?? []);
	// svelte-ignore state_referenced_locally
	let hasMore = $state(data.hasMore ?? false);
	// svelte-ignore state_referenced_locally
	let nextCursor = $state<{ created_at: number; id: string } | null>(data.nextCursor ?? null);
	let loading = $state(false);
	let loadingMore = $state(false);
	let error = $state('');

	onMount(() => {
		void timeTracker.load();
	});

	const publicConfig = $derived(
		data.publicConfig ?? {
			siteTitle: 'fermentario',
			description: 'Published notes.',
			notesEnabled: true,
			showCoverImages: true,
			updatedAt: 0
		}
	);
	const locale = $derived(dayLocale('en'));

	async function loadMore() {
		if (loadingMore || !hasMore) return;
		loadingMore = true;
		try {
			const q = nextCursor
				? `&before=${nextCursor.created_at}&before_id=${encodeURIComponent(nextCursor.id)}`
				: '';
			const res = await fetch(`/api/public/notes?limit=50${q}`);
			const d = await res.json();
			if (!res.ok) throw new Error(d?.error ?? 'Failed to load notes.');
			notes = [...notes, ...((d.notes as Note[]) ?? [])];
			hasMore = !!d.hasMore;
			nextCursor = (d.nextCursor as typeof nextCursor) ?? null;
		} catch (e) {
			error = (e as Error)?.message ?? 'Failed to load notes.';
		} finally {
			loadingMore = false;
		}
	}

	function monthKey(d: Date): string {
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
	}

	function monthLabel(d: Date): string {
		return d.toLocaleDateString(locale, { month: 'long', year: 'numeric' });
	}

	type MonthGroup = { key: string; label: string; items: Note[] };
	type YearGroup = { year: string; months: MonthGroup[]; count: number };

	const years = $derived.by((): YearGroup[] => {
		const byYear = new Map<string, Map<string, MonthGroup>>();
		for (const n of notes) {
			const d = new Date(n.created_at);
			const y = String(d.getFullYear());
			const k = monthKey(d);
			let months = byYear.get(y);
			if (!months) {
				months = new Map();
				byYear.set(y, months);
			}
			let m = months.get(k);
			if (!m) {
				m = { key: k, label: monthLabel(d), items: [] };
				months.set(k, m);
			}
			m.items.push(n);
		}
		return [...byYear.entries()]
			.sort((a, b) => Number(b[0]) - Number(a[0]))
			.map(([year, months]) => {
				const ordered = [...months.values()].sort((a, b) => (a.key < b.key ? 1 : -1));
				return { year, months: ordered, count: ordered.reduce((c, m) => c + m.items.length, 0) };
			});
	});

	function excerpt(content: string, max = 160): string {
		const flat = content.replace(/\s+/g, ' ').trim();
		return flat.length <= max ? flat : `${flat.slice(0, max).trim()}…`;
	}
</script>

<svelte:head>
	<title>{publicConfig.siteTitle}</title>
	<meta name="description" content={publicConfig.description} />
	<link rel="canonical" href="{data.origin}/" />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={publicConfig.siteTitle} />
	<meta property="og:description" content={publicConfig.description} />
	<meta property="og:url" content="{data.origin}/" />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content={publicConfig.siteTitle} />
	<meta name="twitter:description" content={publicConfig.description} />
</svelte:head>

<main class="min-h-dvh">
	<div class="mx-auto max-w-2xl px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-24">
		<TimeTrackerBar widthClass="max-w-2xl" />
		<header class="mb-5 flex items-center justify-between gap-2">
			<h1 class="text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">{publicConfig.siteTitle}</h1>
			<a
				href="/admin/notes"
				class="rounded-full border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-1 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
			>Admin</a>
		</header>

		{#if loading}
			<p class="py-10 text-center text-sm text-stone-500 dark:text-stone-400">Loading published notes…</p>
		{:else if error}
			<p class="py-10 text-center text-sm text-rose-600 dark:text-rose-400">{error}</p>
		{:else if notes.length === 0}
			<p class="rounded-2xl border border-dashed border-stone-300 dark:border-stone-700 px-4 py-10 text-center text-sm text-stone-500 dark:text-stone-400">
				Nothing published yet.
			</p>
		{:else}
			{#each years as y (y.year)}
				<section class="mb-4" aria-label="Published in {y.year}">
					<CollapsibleSection label="{y.year} · {y.count}" storageKey="ferm:pub-year-{y.year}">
						{#each y.months as m (m.key)}
							<div class="mb-3">
								<CollapsibleSection label="{m.label} · {m.items.length}" storageKey="ferm:pub-month-{m.key}">
									<ul class="space-y-2">
										{#each m.items as n (n.id)}
											<li>
												<a
													href="/notes/{n.id}"
													class="block rounded-2xl border border-stone-200/80 dark:border-stone-800/80 bg-white/70 dark:bg-stone-900/70 px-4 py-3 hover:bg-stone-100 dark:hover:bg-stone-800"
												>
													{#if n.coverId && publicConfig.showCoverImages}<img src="/api/notes/photos/{n.coverId}" alt="" loading="lazy" class="mb-2 h-32 w-full rounded-xl object-cover" />{/if}
													<p class="text-[15px] leading-snug text-stone-800 dark:text-stone-200">{excerpt(n.content)}</p>
													<p class="mt-1 text-[11px] tabular-nums text-stone-400 dark:text-stone-500">
														{new Date(n.created_at).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}
														{#if (n.commentCount ?? 0) > 0} · {n.commentCount} comments{/if}
													</p>
													{#if (n.linkedNotes?.length ?? 0) > 0}
														<div class="mt-1.5">
															<NoteLinkPills links={n.linkedNotes ?? []} />
														</div>
													{/if}
												</a>
											</li>
										{/each}
									</ul>
								</CollapsibleSection>
							</div>
						{/each}
					</CollapsibleSection>
				</section>
			{/each}
			{#if hasMore}
				<div class="flex justify-center pb-2">
					<button
						type="button"
						class="rounded-full border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-4 py-2 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-60"
						disabled={loadingMore}
						onclick={() => void loadMore()}
					>{loadingMore ? 'Loading…' : 'Load more'}</button>
				</div>
			{/if}
		{/if}
	</div>
</main>
