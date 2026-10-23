<script lang="ts">
	import { onMount, tick, type Component } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import { search } from '$lib/search.svelte';
	import { SEARCH_GROUPS, searchHref, type SearchHit, type SearchKind } from '$lib/search';
	import { isAppleDevice } from '$lib/platform';
	import Kbd from '$lib/components/Kbd.svelte';
	import Search from '@lucide/svelte/icons/search';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import NotebookPen from '@lucide/svelte/icons/notebook-pen';
	import ListTodo from '@lucide/svelte/icons/list-todo';
	import Scale from '@lucide/svelte/icons/scale';
	import LibraryBig from '@lucide/svelte/icons/library-big';
	import Lightbulb from '@lucide/svelte/icons/lightbulb';

	const ICONS: Record<SearchKind, Component> = {
		note: NotebookPen,
		todo: ListTodo,
		principle: Scale,
		library: LibraryBig,
		influences: Lightbulb
	};

	const DATE = new Intl.DateTimeFormat(undefined, {
		month: 'short',
		day: 'numeric',
		year: 'numeric'
	});

	let apple = $state(false);
	let query = $state('');
	let results = $state<SearchHit[]>([]);
	let loading = $state(false);
	let error = $state('');
	let selected = $state(0);
	let inputEl = $state<HTMLInputElement | null>(null);
	let listEl = $state<HTMLDivElement | null>(null);
	let restoreFocus: HTMLElement | null = null;

	onMount(() => {
		apple = isAppleDevice();
	});

	// A route change (browser Back, a link outside the palette) must not leave
	// the palette over the new page.
	afterNavigate(() => {
		if (search.open) search.closeSearch();
	});

	const groups = $derived.by(() => {
		let index = 0;
		return SEARCH_GROUPS.map((group) => {
			const rows = results
				.filter((hit) => hit.kind === group.kind)
				.map((hit) => ({ hit, index: index++ }));
			return { ...group, rows };
		}).filter((group) => group.rows.length > 0);
	});
	const flat = $derived(groups.flatMap((group) => group.rows.map((row) => row.hit)));

	// One effect owns the open/close cycle: reset the field, move focus in,
	// then put focus back where it came from.
	$effect(() => {
		if (search.open) {
			restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
			query = '';
			results = [];
			error = '';
			selected = 0;
			void tick().then(() => inputEl?.focus());
			return;
		}
		if (restoreFocus) {
			const target = restoreFocus;
			restoreFocus = null;
			target.focus();
		}
	});

	$effect(() => {
		const q = query.trim();
		if (!search.open || q.length < 2) {
			results = [];
			loading = false;
			error = '';
			return;
		}

		const ctrl = new AbortController();
		loading = true;
		error = '';
		const timer = setTimeout(async () => {
			try {
				const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, {
					signal: ctrl.signal
				});
				if (!res.ok) throw new Error(`search ${res.status}`);
				const data = (await res.json()) as { hits?: SearchHit[] };
				if (ctrl.signal.aborted) return;
				results = Array.isArray(data.hits) ? data.hits : [];
				selected = 0;
			} catch {
				if (ctrl.signal.aborted) return;
				results = [];
				error = 'Search failed. Try again.';
			} finally {
				if (!ctrl.signal.aborted) loading = false;
			}
		}, 180);

		return () => {
			clearTimeout(timer);
			ctrl.abort();
		};
	});

	function close() {
		search.closeSearch();
	}

	function openHit(hit: SearchHit) {
		const href = searchHref(hit);
		if (!href) return;
		close();
		void goto(href);
	}

	function move(delta: number) {
		if (flat.length === 0) return;
		selected = (selected + delta + flat.length) % flat.length;
		listEl
			?.querySelector<HTMLElement>(`[data-index="${selected}"]`)
			?.scrollIntoView({ block: 'nearest' });
	}

	function handleWindowKeydown(e: KeyboardEvent) {
		if (e.isComposing) return;
		const mod = e.metaKey || e.ctrlKey;

		if (mod && !e.shiftKey && !e.altKey && (e.key === 'k' || e.key === 'K')) {
			if (page.url.pathname === '/welcome' || page.url.pathname === '/journal-error') return;
			e.preventDefault();
			if (search.open) {
				inputEl?.focus();
				inputEl?.select();
			} else {
				search.openSearch();
			}
			return;
		}

		if (!search.open) return;
		if (e.key === 'Escape') {
			e.preventDefault();
			close();
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			move(1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			move(-1);
		} else if (e.key === 'Enter' && flat[selected]) {
			e.preventDefault();
			openHit(flat[selected]);
		}
	}

	function highlight(text: string, needle: string): { text: string; match: boolean }[] {
		const q = needle.trim();
		if (!q) return [{ text, match: false }];
		const lower = text.toLowerCase();
		const target = q.toLowerCase();
		const parts: { text: string; match: boolean }[] = [];
		let from = 0;
		let at = lower.indexOf(target);
		while (at !== -1) {
			if (at > from) parts.push({ text: text.slice(from, at), match: false });
			parts.push({ text: text.slice(at, at + target.length), match: true });
			from = at + target.length;
			at = lower.indexOf(target, from);
		}
		if (from < text.length) parts.push({ text: text.slice(from), match: false });
		return parts;
	}

	function meta(hit: SearchHit): string {
		const date = hit.at ? DATE.format(new Date(hit.at)) : '';
		return [hit.context, date].filter(Boolean).join(' · ');
	}
</script>

<svelte:window onkeydown={handleWindowKeydown} />

{#if search.open}
	<div
		class="fixed inset-0 z-50 overflow-y-auto bg-stone-900/40 p-4 pt-[max(4rem,12vh)] dark:bg-black/60 backdrop-blur-md"
		role="dialog"
		aria-modal="true"
		aria-label="Search"
		tabindex="-1"
		onclick={(e) => {
			if (e.target === e.currentTarget) close();
		}}
		onkeydown={(e) => {
			if (e.key !== 'Escape') return;
			e.preventDefault();
			e.stopPropagation();
			close();
		}}
		transition:fade={{ duration: motionMs(BACKDROP_MS) }}
	>
		<div
			class="mx-auto w-full max-w-xl rounded-2xl bg-white shadow-2xl dark:bg-stone-900"
			transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}
		>
			<div class="flex items-center gap-2 border-b border-stone-200 px-3 pr-2 dark:border-stone-800">
				<Search class="h-4 w-4 shrink-0 text-stone-400 dark:text-stone-500" />
				<input
					bind:this={inputEl}
					bind:value={query}
					type="search"
					placeholder="Search notes, tasks, principles…"
					aria-label="Search notes, tasks and principles"
					aria-keyshortcuts="Meta+K Control+K"
					autocomplete="off"
					spellcheck="false"
					class="min-w-0 flex-1 bg-transparent py-3.5 text-sm text-stone-900 outline-none placeholder:text-stone-400 dark:text-stone-100 dark:placeholder:text-stone-500"
				/>
				{#if loading}
					<LoaderCircle class="h-4 w-4 shrink-0 animate-spin text-stone-400 dark:text-stone-500" />
				{:else}
					<Kbd keys={apple ? ['⌘', 'K'] : ['Ctrl', 'K']} />
				{/if}
			</div>

			<p class="sr-only" aria-live="polite">
				{query.trim().length < 2
					? 'Type at least 2 characters to search.'
					: loading
						? 'Searching.'
						: flat.length === 0
							? 'No results.'
							: `${flat.length} result${flat.length === 1 ? '' : 's'}.`}
			</p>

			{#if query.trim().length < 2}
				<p class="px-4 py-10 text-center text-sm text-stone-500 dark:text-stone-400">
					Type at least 2 characters to search notes, tasks and principles.
				</p>
			{:else if loading && flat.length === 0}
				<p class="px-4 py-10 text-center text-sm text-stone-500 dark:text-stone-400">Searching…</p>
			{:else if error}
				<p class="px-4 py-10 text-center text-sm text-rose-600 dark:text-rose-400">{error}</p>
			{:else if flat.length === 0}
				<p class="px-4 py-10 text-center text-sm text-stone-500 dark:text-stone-400">
					No matches for “{query.trim()}”.
				</p>
			{:else}
				<div bind:this={listEl} class="max-h-[60vh] overflow-y-auto overscroll-contain py-1">
					{#each groups as group (group.kind)}
						<div
							class="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-stone-400 dark:text-stone-500"
						>
							{group.label}
						</div>
						{#each group.rows as row (row.hit.kind + row.hit.id)}
							{@const Icon = ICONS[row.hit.kind]}
							{@const info = meta(row.hit)}
							<button
								type="button"
								data-index={row.index}
								class="flex w-full items-start gap-3 px-3 py-2 text-left {row.index === selected
									? 'bg-stone-100 dark:bg-stone-800'
									: ''}"
								onclick={() => openHit(row.hit)}
								onmouseenter={() => (selected = row.index)}
							>
								<span
									class="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"
								>
									<Icon class="h-3.5 w-3.5" />
								</span>
								<span class="min-w-0 flex-1">
									<span class="line-clamp-2 text-sm leading-snug text-stone-900 dark:text-stone-100">
										{#each highlight(row.hit.text, query) as part, i (i)}{#if part.match}<mark class="rounded bg-amber-200/70 px-0.5 text-inherit dark:bg-amber-300/30">{part.text}</mark>{:else}{part.text}{/if}{/each}
									</span>
									{#if info}
										<span class="mt-0.5 block truncate text-xs text-stone-400 dark:text-stone-500"
											>{info}</span
										>
									{/if}
								</span>
							</button>
						{/each}
					{/each}
				</div>
			{/if}

			{#if query.trim().length >= 2}
				<div
					class="flex items-center justify-end gap-3 border-t border-stone-200 px-4 py-2 text-[11px] text-stone-400 dark:border-stone-800 dark:text-stone-500"
				>
					<span class="mr-auto hidden sm:inline">↑↓ navigate · ↵ open · Esc close</span>
					<span>{loading ? 'Searching…' : `${flat.length} result${flat.length === 1 ? '' : 's'}`}</span>
				</div>
			{/if}
		</div>
	</div>
{/if}
