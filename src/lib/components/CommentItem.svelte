<script module lang="ts">
	// Expanded comment ids are module-shared: the map survives route changes
	// and keeps every mounted comment row in sync with the stored choice.
	let expanded = $state<Record<string, boolean>>({});
	let expandedLoaded = false;
	const EXPANDED_KEY = 'ferm:expanded-comments';

	function loadExpandedOnce() {
		if (expandedLoaded) return;
		expandedLoaded = true;
		try {
			const raw = localStorage.getItem(EXPANDED_KEY);
			if (!raw) return;
			const parsed = JSON.parse(raw) as unknown;
			if (!Array.isArray(parsed)) return;
			for (const id of parsed) {
				if (typeof id === 'string') expanded[id] = true;
			}
		} catch {
			// Bad storage never breaks the comment list.
		}
	}

	function setExpanded(id: string, open: boolean) {
		if (open) expanded[id] = true;
		else delete expanded[id];
		try {
			localStorage.setItem(EXPANDED_KEY, JSON.stringify(Object.keys(expanded)));
		} catch {
			// Storage full/blocked: the fold still works for the session.
		}
	}
</script>

<script lang="ts">
	import Check from '@lucide/svelte/icons/check';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import Copy from '@lucide/svelte/icons/copy';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Pin from '@lucide/svelte/icons/pin';
	import { tick } from 'svelte';
	import { motionMs } from '$lib/motion';
	import { showToast } from '$lib/toast.svelte';

	type Props = {
		id: string;
		content: string;
		date: string;
		pinned: boolean;
		onPin?: () => void;
		onEdit?: () => void;
		onDelete?: () => void;
	};
	let { id, content, date, pinned, onPin, onEdit, onDelete }: Props = $props();

	let copied = $state(false);
	let copyTimer: ReturnType<typeof setTimeout> | undefined;

	async function copyComment() {
		try {
			if (!navigator.clipboard) throw new Error('clipboard unavailable');
			await navigator.clipboard.writeText(content);
			copied = true;
			clearTimeout(copyTimer);
			copyTimer = setTimeout(() => (copied = false), 1500);
		} catch {
			showToast('Could not copy — clipboard unavailable.');
		}
	}

	// Long comments fold to one line, the same way notes do. New comments
	// stay collapsed; the expanded ids persist in localStorage so a reload
	// keeps only the comments the user chose to open.
	let textEl = $state<HTMLElement | null>(null);
	let foldEl = $state<HTMLElement | null>(null);
	let foldable = $state(false);
	let collapsed = $state(true);
	let maxHeight = $state<string | undefined>(undefined);
	let unclamped = $state(false);
	let animating = false;

	$effect(() => {
		loadExpandedOnce();
		measure();
		const onResize = () => measure();
		window.addEventListener('resize', onResize);
		return () => window.removeEventListener('resize', onResize);
	});

	function measure() {
		const el = textEl;
		if (!el || animating || !content) return;
		// scrollHeight reports the full content height even while line-clamp
		// hides the overflow, so this works in both states.
		const line = parseFloat(getComputedStyle(el).lineHeight) || 21;
		const long = el.scrollHeight > line * 1.5;
		foldable = long;
		if (!long) {
			collapsed = false;
			return;
		}
		collapsed = !(id in expanded);
		// Same rule as the timeline: a folded comment needs the one-line cap
		// beside the clamp — WebKit under-clamps with the clamp alone, so a
		// reload would show the comment half contracted.
		if (collapsed && maxHeight === undefined) maxHeight = `${Math.ceil(line)}px`;
	}

	function finishFold(e: TransitionEvent) {
		if (e.target !== e.currentTarget || e.propertyName !== 'max-height') return;
		animating = false;
		// Same rule as the timeline: while the comment stays folded, keep the
		// one-line cap so the card never flashes back to full height.
		if (collapsed) {
			unclamped = false;
			return;
		}
		maxHeight = undefined;
		unclamped = false;
		measure();
	}

	async function toggleFolded() {
		if (!foldable || animating) return;
		const duration = motionMs(180);

		if (!duration || !foldEl) {
			collapsed = !collapsed;
			setExpanded(id, !collapsed);
			return;
		}

		animating = true;
		const start = foldEl.getBoundingClientRect().height;

		if (collapsed) {
			collapsed = false;
			setExpanded(id, true);
			maxHeight = `${start}px`;
			await tick();
			void foldEl.getBoundingClientRect();
			const full = Math.max(foldEl.scrollHeight, textEl?.getBoundingClientRect().height ?? 0);
			maxHeight = `${full}px`;
		} else {
			collapsed = true;
			setExpanded(id, false);
			unclamped = true;
			maxHeight = `${start}px`;
			await tick();
			void foldEl.getBoundingClientRect();
			const line = parseFloat(getComputedStyle(textEl ?? foldEl).lineHeight) || 21;
			maxHeight = `${Math.ceil(line)}px`;
		}
	}
</script>

<li class="rounded-2xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-stone-900 px-4 py-2.5">
	<div
		bind:this={foldEl}
		class="transition-[max-height] duration-[180ms] ease-out motion-reduce:transition-none {maxHeight !== undefined || (foldable && collapsed && !unclamped) ? 'overflow-hidden' : ''}"
		style:max-height={maxHeight}
		ontransitionend={finishFold}
	>
		{#if foldable}
			<!-- Fold lives on a small chevron so the text stays selectable
				and copyable, identical to the note cards. -->
			<div class="flex items-start">
				<button
					type="button"
					class="-ml-1 mt-px grid h-4 w-4 shrink-0 place-items-center rounded text-stone-400 hover:bg-stone-100 hover:text-stone-600 dark:hover:bg-stone-800 dark:hover:text-stone-300"
					aria-label={collapsed ? 'Expand comment' : 'Collapse comment'}
					aria-expanded={!collapsed}
					onclick={() => void toggleFolded()}
				><ChevronDown class="h-3 w-3 transition-transform duration-200 motion-reduce:transition-none {collapsed ? '-rotate-90' : ''}" /></button>
				<div
					bind:this={textEl}
					class="min-w-0 flex-1 whitespace-pre-wrap text-xs leading-snug text-stone-800 dark:text-stone-200 {collapsed && !unclamped ? 'line-clamp-1' : ''}"
				>{content}</div>
			</div>
		{:else}
			<p
				bind:this={textEl}
				class="whitespace-pre-wrap text-xs leading-snug text-stone-800 dark:text-stone-200"
			>{content}</p>
		{/if}
	</div>
	<div class="mt-1 flex items-center justify-between gap-2">
		<span class="text-[11px] tabular-nums text-stone-400 dark:text-stone-500">{date}</span>
		<div class="-mr-1 flex shrink-0 items-center gap-0.5">
			<button
				type="button"
				class="grid h-7 w-7 place-items-center rounded-full {copied ? 'text-emerald-600 dark:text-emerald-400' : 'text-stone-300 dark:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300'}"
				aria-label={copied ? 'Comment copied' : 'Copy comment'}
				title={copied ? 'Comment copied' : 'Copy comment'}
				onclick={() => void copyComment()}
			>
				{#if copied}<Check class="h-3.5 w-3.5" />{:else}<Copy class="h-3.5 w-3.5" />{/if}
			</button>
			{#if onPin}
				<button
					type="button"
					class="grid h-7 w-7 place-items-center rounded-full hover:bg-stone-100 dark:hover:bg-stone-800 {pinned ? 'text-amber-500 dark:text-amber-400' : 'text-stone-300 dark:text-stone-600 hover:text-stone-600 dark:hover:text-stone-300'}"
					aria-label={pinned ? 'Unpin comment' : 'Pin comment'}
					title={pinned ? 'Unpin comment' : 'Pin comment'}
					aria-pressed={pinned}
					onclick={onPin}
				>
					<Pin class="h-3.5 w-3.5 {pinned ? 'fill-current' : ''}" />
				</button>
			{/if}
			{#if onEdit}
				<button
					type="button"
					class="grid h-7 w-7 place-items-center rounded-full text-stone-300 dark:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300"
					aria-label="Edit comment"
					title="Edit comment"
					onclick={onEdit}
				>
					<Pencil class="h-3.5 w-3.5" />
				</button>
			{/if}
			{#if onDelete}
				<button
					type="button"
					class="grid h-7 w-7 place-items-center rounded-full text-base leading-none text-stone-300 dark:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-rose-600 dark:hover:text-rose-400"
					aria-label="Delete comment"
					title="Delete comment"
					onclick={onDelete}
				>&times;</button>
			{/if}
		</div>
	</div>
</li>
