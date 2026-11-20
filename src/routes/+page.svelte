<script lang="ts">
	import { onMount } from 'svelte';
	import CollapsibleSection from '$lib/components/CollapsibleSection.svelte';
	import PublicNoteCard from '$lib/components/PublicNoteCard.svelte';
	import { tagColors } from '$lib/tag-colors.svelte';
	import TimeTrackerBar from '$lib/components/TimeTrackerBar.svelte';
	import PublicHeader from '$lib/components/PublicHeader.svelte';
	import { dayLocale } from '$lib/dates';
	import { contentWidthClass } from '$lib/display';
	import type { Note } from '$lib/types';
	import { timeTracker } from '$lib/time-tracker.svelte';
	import { MINI_APPS, miniApps, openMiniApp, type MiniAppDef } from '$lib/mini-apps.svelte';
	import { SLOGAN } from '$lib/brand';
	import { shortcutKeys } from '$lib/shortcuts';
	import { isAppleDevice } from '$lib/platform';
	import Kbd from '$lib/components/Kbd.svelte';

	// Public homepage: published notes only, server-rendered so crawlers see
	// HTML. Both year and month levels toggle with the shared
	// CollapsibleSection (slide 180 ms, remembered state). No composer, no
	// admin actions here. Older pages append client-side via the public API.
	let { data } = $props();
	// svelte-ignore state_referenced_locally
	let notes = $state<Note[]>(data.notes ?? []);
	// Tags of published notes only, built on the server with the feed.
	const tagCounts = $derived(data.tags ?? []);
	// svelte-ignore state_referenced_locally
	let hasMore = $state(data.hasMore ?? false);
	// svelte-ignore state_referenced_locally
	let nextCursor = $state<{ created_at: number; id: string } | null>(data.nextCursor ?? null);
	let loading = $state(false);
	let loadingMore = $state(false);
	let error = $state('');
	// The desktop width follows the same browser preference as /admin. The
	// server cannot know it, so the page renders standard and adjusts here.
	let contentClass = $state(contentWidthClass(undefined));
	let apple = $state(false);

	onMount(() => {
		apple = isAppleDevice();
		void tagColors.load();
		// The root layout owns `timeTracker.load()`; calling it here too sent a
		// second GET /api/time-tracker on the first homepage visit.
		// The homepage list shows the same `Latest used` pill as the mini apps
		// modal, so it needs the usage this browser recorded.
		miniApps.loadUsage();
		try {
			const raw = localStorage.getItem('fermentario.config');
			if (raw) contentClass = contentWidthClass((JSON.parse(raw) as { contentWidth?: string })?.contentWidth);
		} catch {}
	});

	const publicConfig = $derived(
		data.publicConfig ?? {
			siteTitle: 'fermentario',
			description: SLOGAN,
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

</script>

{#snippet toolRow(app: MiniAppDef)}
	{@const Icon = app.icon}
	<span class="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200">
		<Icon class="h-4.5 w-4.5" />
	</span>
	<span class="min-w-0 flex-1">
		<span class="flex items-center gap-2">
			<span class="text-sm font-medium text-stone-900 dark:text-stone-100">{app.label}</span>
			{#if miniApps.latestUsedId() === app.id}
				<span class="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">Latest used</span>
			{/if}
			{#if app.id === 'time-tracker' && timeTracker.running}
				<span class="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">Running</span>
			{/if}
		</span>
		<span class="mt-0.5 block text-[12px] text-stone-500 dark:text-stone-400">{app.description}</span>
	</span>
	{#if app.shortcut}
		<span class="shrink-0 self-center"><Kbd keys={shortcutKeys(app.shortcut, apple)} /></span>
	{/if}
{/snippet}

<svelte:head>
	<title>{publicConfig.siteTitle}</title>
	<meta name="description" content={SLOGAN} />
	<link rel="canonical" href="{data.origin}/" />
	<meta property="og:type" content="website" />
	<meta property="og:title" content={publicConfig.siteTitle} />
	<meta property="og:description" content={SLOGAN} />
	<meta property="og:url" content="{data.origin}/" />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content={publicConfig.siteTitle} />
	<meta name="twitter:description" content={SLOGAN} />
</svelte:head>

<main class="min-h-dvh">
	<div class="mx-auto {contentClass} px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-24">
		<TimeTrackerBar widthClass={contentClass} />
		<PublicHeader siteTitle={publicConfig.siteTitle} />

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
										{#each m.items as n (n.id)}												<li>
													<PublicNoteCard note={n} showCover={publicConfig.showCoverImages} {locale} />
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

		<section class="mt-6">
		<CollapsibleSection label="Tools" storageKey="ferm:pub-tools">
			<ul class="space-y-2">
				{#each MINI_APPS as app (app.id)}
					<li>
						{#if app.kind === 'modal'}
							<button
								type="button"
								class="flex w-full items-start gap-3 rounded-2xl border border-stone-200/80 bg-white/70 px-4 py-3 text-left hover:bg-stone-100 dark:border-stone-800/80 dark:bg-stone-900/70 dark:hover:bg-stone-800"
								onclick={() => openMiniApp(app)}
							>
								{@render toolRow(app)}
							</button>
						{:else}
							<a
								href={app.href}
								class="flex items-start gap-3 rounded-2xl border border-stone-200/80 bg-white/70 px-4 py-3 hover:bg-stone-100 dark:border-stone-800/80 dark:bg-stone-900/70 dark:hover:bg-stone-800"
							>
								{@render toolRow(app)}
							</a>
						{/if}
					</li>
				{/each}
			</ul>
		</CollapsibleSection>
		</section>

		{#if tagCounts.length > 0}
			<section class="mt-6">
				<CollapsibleSection label="Tags" storageKey="ferm:pub-tags">
					<nav class="flex flex-wrap items-center gap-2" aria-label="Tag cloud">
						{#each tagCounts as t (t.tag)}
							<a
								href={`/tags/${encodeURIComponent(t.tag)}`}
								class="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-sm font-medium leading-tight transition-colors {tagColors.chip(t.tag)}"
								title={`${t.count} ${t.count === 1 ? 'published note' : 'published notes'}`}
								aria-label="#{t.tag}: {t.count} {t.count === 1 ? 'published note' : 'published notes'}"
							>
								#{t.tag}
								<span class="text-[10px] tabular-nums opacity-70" aria-hidden="true">{t.count}</span>
							</a>
						{/each}
					</nav>
				</CollapsibleSection>
			</section>
		{/if}
	</div>
</main>
