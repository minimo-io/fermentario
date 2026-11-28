<script lang="ts">
	import { onMount, tick, type Component } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import { MINI_APPS, miniApps, openMiniApp } from '$lib/mini-apps.svelte';
	import { shortcutKeys } from '$lib/shortcuts';
	import { search } from '$lib/search.svelte';
	import { commandCodeMatches, filterCommands, type CommandDef } from '$lib/commands';
	import { showToast } from '$lib/toast.svelte';
	import { SEARCH_GROUPS, searchHref, type SearchHit, type SearchKind } from '$lib/search';
	import { loadTagChoices } from '$lib/tag-suggest';
	import type { TagCount } from '$lib/tag-cloud';
	import { isAppleDevice } from '$lib/platform';
	import Kbd from '$lib/components/Kbd.svelte';
	import Search from '@lucide/svelte/icons/search';
	import Hash from '@lucide/svelte/icons/hash';
	import LoaderCircle from '@lucide/svelte/icons/loader-circle';
	import NotebookPen from '@lucide/svelte/icons/notebook-pen';
	import ListTodo from '@lucide/svelte/icons/list-todo';
	import Scale from '@lucide/svelte/icons/scale';
	import LibraryBig from '@lucide/svelte/icons/library-big';
	import Lightbulb from '@lucide/svelte/icons/lightbulb';
	import Wallet from '@lucide/svelte/icons/wallet';
	import ChartCandlestick from '@lucide/svelte/icons/chart-candlestick';

	const ICONS: Record<SearchKind, Component> = {
		note: NotebookPen,
		todo: ListTodo,
		principle: Scale,
		holding: Wallet,
		trading: ChartCandlestick,
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
	let commandMode = $state(false);
	let tags = $state<TagCount[]>([]);
	let tagsLoading = $state(false);
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

	const trimmedQuery = $derived(query.trim());
	const commandMatches = $derived(commandMode ? filterCommands(query) : []);
	const commandCount = $derived(commandMatches.length);
	// A query that starts with `#` is a tag lookup, not a text search. `#`
	// alone lists every tag, and each further character narrows the prefix.
	const tagMode = $derived(!commandMode && trimmedQuery.startsWith('#'));
	const tagQuery = $derived(tagMode ? trimmedQuery.slice(1).trim().toLowerCase() : '');
	const tagMatches = $derived(tagMode ? tags.filter((tag) => tag.tag.startsWith(tagQuery)) : []);
	const tagCount = $derived(tagMatches.length);
	// A bare exact code is the one exception to "commands never mix with
	// normal results": it appears in its own group above them, so Enter on the
	// code runs the command instead of opening the first note.
	const codeMatches = $derived(commandMode || tagMode ? [] : commandCodeMatches(trimmedQuery));
	const codeCount = $derived(codeMatches.length);

	// Mini apps are scoped results too: typing their name finds them without
	// showing every app before the first keystroke.
	const appMatches = $derived.by(() => {
		if (commandMode || tagMode) return [];
		const q = trimmedQuery.toLowerCase();
		if (q.length < 2) return [];
		return miniApps
			.orderedApps()
			.filter((app) => app.label.toLowerCase().includes(q) || app.description.toLowerCase().includes(q));
	});
	const appCount = $derived(appMatches.length);

	const groups = $derived.by(() => {
		if (commandMode || tagMode) return [];
		let index = codeCount + appCount;
		return SEARCH_GROUPS.map((group) => {
			const rows = results
				.filter((hit) => hit.kind === group.kind)
				.map((hit) => ({ hit, index: index++ }));
			return { ...group, rows };
		}).filter((group) => group.rows.length > 0);
	});
	const flat = $derived(groups.flatMap((group) => group.rows.map((row) => row.hit)));
	const plainCount = $derived(appCount + flat.length);
	const total = $derived(
		commandMode ? commandCount : tagMode ? tagCount : codeCount + plainCount
	);
	const statusText = $derived.by(() => {
		if (commandMode) {
			return commandCount === 0
				? 'No commands.'
				: `${commandCount} command${commandCount === 1 ? '' : 's'}.`;
		}
		if (tagMode) {
			if (tagCount === 0) {
				if (tagsLoading && tags.length === 0) return 'Loading tags.';
				return tags.length === 0 ? 'No tags yet.' : `No tags match #${tagQuery}.`;
			}
			return `${tagCount} tag${tagCount === 1 ? '' : 's'}.`;
		}
		if (trimmedQuery.length < 2) return 'Type at least 2 characters to search anything.';
		if (loading && total === 0) return 'Searching.';
		if (total === 0) return 'No results.';
		if (codeCount > 0) {
			const rest = loading
				? 'searching'
				: `${plainCount} result${plainCount === 1 ? '' : 's'}`;
			return `${codeCount} command${codeCount === 1 ? '' : 's'}, ${rest}.`;
		}
		return `${total} result${total === 1 ? '' : 's'}.`;
	});
	const footerText = $derived.by(() => {
		if (commandMode) return `${commandCount} command${commandCount === 1 ? '' : 's'}`;
		if (tagMode) {
			if (tagsLoading && tags.length === 0) return 'Loading tags…';
			return `${tagCount} tag${tagCount === 1 ? '' : 's'}`;
		}
		if (codeCount > 0) {
			const rest = loading
				? 'searching…'
				: `${plainCount} result${plainCount === 1 ? '' : 's'}`;
			return `${codeCount} command${codeCount === 1 ? '' : 's'} · ${rest}`;
		}
		if (loading) return 'Searching…';
		return `${total} result${total === 1 ? '' : 's'}`;
	});

	function openApp(app: (typeof MINI_APPS)[number]) {
		close();
		openMiniApp(app);
	}

	function openSelected() {
		if (commandMode) {
			const command = commandMatches[selected];
			if (command) void runCommand(command);
			return;
		}
		if (tagMode) {
			const tag = tagMatches[selected];
			if (tag) openTag(tag.tag);
			return;
		}
		if (selected < codeCount) {
			const command = codeMatches[selected];
			if (command) void runCommand(command);
			return;
		}
		if (selected < codeCount + appCount) {
			const app = appMatches[selected - codeCount];
			if (app) openApp(app);
			return;
		}
		const hit = flat[selected - codeCount - appCount];
		if (hit) openHit(hit);
	}

	// One effect owns the open/close cycle: reset the field, move focus in,
	// then put focus back where it came from.
	$effect(() => {
		if (search.open) {
			const openInCommandMode = search.openInCommandMode;
			restoreFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
			miniApps.loadUsage();
			query = '';
			results = [];
			error = '';
			selected = 0;
			commandMode = openInCommandMode;
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
		if (!search.open || commandMode || tagMode || q.length < 2) {
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

	// The tag list comes from the cached tag cloud, so `#` opens instantly
	// after the first load. Load only while tag mode is open.
	$effect(() => {
		if (!search.open || !tagMode) return;
		let live = true;
		tagsLoading = true;
		void loadTagChoices().then((list) => {
			if (!live) return;
			tags = list;
			tagsLoading = false;
		});
		return () => {
			live = false;
		};
	});

	// `:` opens command mode like a vim command line. The colon is consumed
	// into the blue prefix pill, so typing `:note` filters by `note`.
	function onQueryInput(e: Event) {
		const el = e.currentTarget as HTMLInputElement;
		let value = el.value;
		if (!commandMode && value.startsWith(':')) {
			commandMode = true;
			value = value.slice(1).replace(/^\s+/, '');
			selected = 0;
			el.value = value;
			el.setSelectionRange(value.length, value.length);
		}
		query = value;
		selected = 0;
	}

	function exitCommandMode() {
		commandMode = false;
		query = '';
		selected = 0;
		results = [];
		loading = false;
		error = '';
		void tick().then(() => inputEl?.focus());
	}

	function close() {
		search.closeSearch();
	}

	function openHit(hit: SearchHit) {
		const href = searchHref(hit);
		if (!href) return;
		close();
		void goto(href);
	}

	function openTag(tag: string) {
		close();
		void goto(`/admin/tags/${encodeURIComponent(tag)}`);
	}

	async function runCommand(command: CommandDef) {
		// Close the palette first and let its focus restore finish. The command
		// may open a dialog that needs the focus itself.
		close();
		await tick();
		try {
			await command.run();
		} catch (e) {
			showToast((e as Error)?.message ?? 'Command failed.');
		}
	}

	function move(delta: number) {
		if (total === 0) return;
		selected = (selected + delta + total) % total;
		listEl
			?.querySelector<HTMLElement>(`[data-index="${selected}"]`)
			?.scrollIntoView({ block: 'nearest' });
	}

	function handleWindowKeydown(e: KeyboardEvent) {
		if (e.isComposing) return;
		const mod = e.metaKey || e.ctrlKey;

		if (
			!search.open &&
			e.key === ':' &&
			!mod &&
			!e.altKey &&
			page.url.pathname !== '/welcome' &&
			page.url.pathname !== '/journal-error'
		) {
			const target = e.target as HTMLElement | null;
			if (
				target &&
				(target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
			) {
				return;
			}
			if (document.querySelector('[role="dialog"]')) return;
			e.preventDefault();
			search.openCommands();
			return;
		}

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
		} else if (commandMode && query.length === 0 && e.key === 'Backspace') {
			e.preventDefault();
			exitCommandMode();
		} else if (e.key === 'ArrowDown') {
			e.preventDefault();
			move(1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			move(-1);
		} else if (e.key === 'Enter' && total > 0) {
			e.preventDefault();
			openSelected();
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

{#snippet commandRow(command: CommandDef, index: number)}
	{@const Icon = command.icon}
	<button
		type="button"
		data-index={index}
		class="flex w-full items-center gap-3 px-3 py-2 text-left {index === selected
			? 'bg-stone-100 dark:bg-stone-800'
			: ''}"
		onclick={() => void runCommand(command)}
		onmouseenter={() => (selected = index)}
	>
		<span class="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
			<Icon class="h-4 w-4" />
		</span>
		<span class="min-w-0 flex-1">
			<span class="block text-sm font-medium text-stone-900 dark:text-stone-100">{command.label}</span>
			<span class="block truncate text-xs text-stone-500 dark:text-stone-400">{command.description}</span>
		</span>
		<span
			class="shrink-0 rounded-md border border-stone-200 bg-stone-50 px-1.5 py-0.5 font-mono text-[10px] text-stone-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400"
		>{command.code}</span>
	</button>
{/snippet}

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
				{#if commandMode}
					<span
						class="flex shrink-0 items-center gap-1 rounded-full border border-blue-200 bg-blue-100 py-0.5 pl-2 pr-1 text-[11px] font-medium text-blue-700 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300"
					>
						:
						<button
							type="button"
							class="grid h-4 w-4 place-items-center rounded-full text-[13px] leading-none text-blue-500 hover:bg-blue-200/70 hover:text-blue-700 dark:text-blue-400 dark:hover:bg-blue-900/60 dark:hover:text-blue-200"
							aria-label="Exit command mode"
							title="Exit command mode"
							onclick={exitCommandMode}
						>&times;</button>
					</span>
				{:else if tagMode}
					<Hash class="h-4 w-4 shrink-0 text-stone-400 dark:text-stone-500" />
				{:else}
					<Search class="h-4 w-4 shrink-0 text-stone-400 dark:text-stone-500" />
				{/if}
				<input
					bind:this={inputEl}
					value={query}
					oninput={onQueryInput}
					type="search"
					placeholder={commandMode
						? 'Type a command code…'
						: tagMode
							? 'Search tags…'
							: 'Search anything: notes, tasks, tags, tickers…'}
					aria-label={commandMode
						? 'Search commands'
						: tagMode
							? 'Search tags'
							: 'Search notes, tasks, principles, holdings and trading'}
					aria-keyshortcuts="Meta+K Control+K"
					autocomplete="off"
					spellcheck="false"
					class="min-w-0 flex-1 bg-transparent py-3.5 text-base text-stone-900 outline-none placeholder:text-stone-400 dark:text-stone-100 dark:placeholder:text-stone-500"
				/>
				{#if loading || (tagMode && tagsLoading)}
					<LoaderCircle class="h-4 w-4 shrink-0 animate-spin text-stone-400 dark:text-stone-500" />
				{:else}
					<Kbd keys={apple ? ['⌘', 'K'] : ['Ctrl', 'K']} />
				{/if}
			</div>

			<p class="sr-only" aria-live="polite">{statusText}</p>

			{#if commandMode}
				{#if commandCount === 0}
					<div class="px-4 py-10 text-center text-sm text-stone-500 dark:text-stone-400">
						<p>{trimmedQuery ? `No command matches “${trimmedQuery}”.` : 'No commands available.'}</p>
						<button
							type="button"
							class="mt-2 text-xs underline underline-offset-2 hover:text-stone-700 dark:hover:text-stone-200"
							onclick={exitCommandMode}
						>Leave command mode</button>
					</div>
				{:else}
					<div bind:this={listEl} class="max-h-[60vh] overflow-y-auto overscroll-contain py-1">
						<div class="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-stone-400 dark:text-stone-500">
							Commands
						</div>
						{#each commandMatches as command, i (command.code)}
							{@render commandRow(command, i)}
						{/each}
					</div>
				{/if}
			{:else if tagMode}
				{#if tagsLoading && tagCount === 0}
					<p class="px-4 py-10 text-center text-sm text-stone-500 dark:text-stone-400">Loading tags…</p>
				{:else if tagCount === 0}
					<p class="px-4 py-10 text-center text-sm text-stone-500 dark:text-stone-400">
						{tags.length === 0 ? 'No tags yet.' : `No tags match #${tagQuery}.`}
					</p>
				{:else}
					<div bind:this={listEl} class="max-h-[60vh] overflow-y-auto overscroll-contain py-1">
						<div class="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-stone-400 dark:text-stone-500">
							Tags
						</div>
						{#each tagMatches as tag, i (tag.tag)}
							<button
								type="button"
								data-index={i}
								class="flex w-full items-center gap-3 px-3 py-2 text-left {i === selected
									? 'bg-stone-100 dark:bg-stone-800'
									: ''}"
								onclick={() => openTag(tag.tag)}
								onmouseenter={() => (selected = i)}
							>
								<span
									class="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-stone-100 text-stone-500 dark:bg-stone-800 dark:text-stone-400"
								>
									<Hash class="h-3.5 w-3.5" />
								</span>
								<span class="min-w-0 flex-1 truncate text-sm text-stone-900 dark:text-stone-100"
									>#{tag.tag}</span
								>
								<span class="shrink-0 text-xs tabular-nums text-stone-400 dark:text-stone-500">{tag.count}</span>
							</button>
						{/each}
					</div>
				{/if}
			{:else if trimmedQuery.length < 2}
				<div class="py-2">
					<div class="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-stone-400 dark:text-stone-500">Mini apps</div>
					{#each miniApps.orderedApps() as app (app.id)}
						{@const Icon = app.icon}
						<button
							type="button"
							class="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-stone-100 dark:hover:bg-stone-800"
							onclick={() => { close(); openMiniApp(app); }}
						>
							<span class="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
								<Icon class="h-4 w-4" />
							</span>
							<span class="min-w-0 flex-1">
								<span class="block text-sm font-medium text-stone-900 dark:text-stone-100">{app.label}</span>
								<span class="block truncate text-xs text-stone-500 dark:text-stone-400">{app.description}</span>
							</span>
							{#if app.shortcut}
								<span class="shrink-0 self-center"><Kbd keys={shortcutKeys(app.shortcut, apple)} /></span>
							{/if}
						</button>
					{/each}
					<p class="px-4 pb-4 pt-3 text-center text-sm text-stone-500 dark:text-stone-400">
						Search anything: notes, tasks, principles, holdings and trading — 2 characters is enough. Type # for tags, : for commands.
					</p>
				</div>
			{:else if loading && total === 0}
				<p class="px-4 py-10 text-center text-sm text-stone-500 dark:text-stone-400">Searching…</p>
			{:else if error && codeCount === 0}
				<p class="px-4 py-10 text-center text-sm text-rose-600 dark:text-rose-400">{error}</p>
			{:else if total === 0}
				<p class="px-4 py-10 text-center text-sm text-stone-500 dark:text-stone-400">
					No matches for “{trimmedQuery}”.
				</p>
			{:else}
				<div bind:this={listEl} class="max-h-[60vh] overflow-y-auto overscroll-contain py-1">
					{#if codeMatches.length > 0}
						<div class="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-stone-400 dark:text-stone-500">
							Commands
						</div>
						{#each codeMatches as command, i (command.code)}
							{@render commandRow(command, i)}
						{/each}
					{/if}
					{#if appMatches.length > 0}
						<div class="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-stone-400 dark:text-stone-500">
							Mini apps
						</div>
						{#each appMatches as app, i (app.id)}
							{@const Icon = app.icon}
							<button
								type="button"
								data-index={codeCount + i}
								class="flex w-full items-center gap-3 px-3 py-2 text-left {codeCount + i === selected
									? 'bg-stone-100 dark:bg-stone-800'
									: ''}"
								onclick={() => openApp(app)}
								onmouseenter={() => (selected = codeCount + i)}
							>
								<span class="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
									<Icon class="h-4 w-4" />
								</span>
								<span class="min-w-0 flex-1">
									<span class="block text-sm font-medium text-stone-900 dark:text-stone-100">{app.label}</span>
									<span class="block truncate text-xs text-stone-500 dark:text-stone-400">{app.description}</span>
								</span>
								{#if app.shortcut}
									<span class="shrink-0 self-center"><Kbd keys={shortcutKeys(app.shortcut, apple)} /></span>
								{/if}
							</button>
						{/each}
					{/if}
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
					{#if error}
						<p class="px-4 py-3 text-center text-xs text-rose-600 dark:text-rose-400">{error}</p>
					{/if}
				</div>
			{/if}

			{#if commandMode || tagMode || trimmedQuery.length >= 2}
				<div
					class="flex items-center justify-end gap-3 border-t border-stone-200 px-4 py-2 text-[11px] text-stone-400 dark:border-stone-800 dark:text-stone-500"
				>
					<span class="mr-auto hidden sm:inline">
						{commandMode ? '↑↓ navigate · ↵ run · Esc close' : '↑↓ navigate · ↵ open · Esc close'}
					</span>
					<span>{footerText}</span>
				</div>
			{/if}
		</div>
	</div>
{/if}
