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
	import Pencil from '@lucide/svelte/icons/pencil';
	import Pin from '@lucide/svelte/icons/pin';
	import { tick } from 'svelte';
	import { motionMs } from '$lib/motion';

	type Props = {
		id: string;
		content: string;
		date: string;
		pinned: boolean;
		onPin: () => void;
		onEdit: () => void;
		onDelete: () => void;
	};
	let { id, content, date, pinned, onPin, onEdit, onDelete }: Props = $props();

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
	}

	function finishFold(e: TransitionEvent) {
		if (e.target !== e.currentTarget || e.propertyName !== 'max-height') return;
		animating = false;
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
		class="transition-[max-height] duration-[180ms] ease-out motion-reduce:transition-none {maxHeight !== undefined ? 'overflow-hidden' : ''}"
		style:max-height={maxHeight}
		ontransitionend={finishFold}
	>
		{#if foldable}
			<button
				type="button"
				class="block w-full text-left whitespace-pre-wrap text-xs leading-snug text-stone-800 dark:text-stone-200"
				aria-expanded={!collapsed}
				onclick={() => void toggleFolded()}
			>
				<span
					bind:this={textEl}
					class="w-full {collapsed && !unclamped ? 'line-clamp-1' : 'block'}"
				>{content}</span>
			</button>
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
				class="grid h-7 w-7 place-items-center rounded-full hover:bg-stone-100 dark:hover:bg-stone-800 {pinned ? 'text-amber-500 dark:text-amber-400' : 'text-stone-300 dark:text-stone-600 hover:text-stone-600 dark:hover:text-stone-300'}"
				aria-label={pinned ? 'Unpin comment' : 'Pin comment'}
				title={pinned ? 'Unpin comment' : 'Pin comment'}
				aria-pressed={pinned}
				onclick={onPin}
			>
				<Pin class="h-3.5 w-3.5 {pinned ? 'fill-current' : ''}" />
			</button>
			<button
				type="button"
				class="grid h-7 w-7 place-items-center rounded-full text-stone-300 dark:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300"
				aria-label="Edit comment"
				title="Edit comment"
				onclick={onEdit}
			>
				<Pencil class="h-3.5 w-3.5" />
			</button>
			<button
				type="button"
				class="grid h-7 w-7 place-items-center rounded-full text-base leading-none text-stone-300 dark:text-stone-600 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-rose-600 dark:hover:text-rose-400"
				aria-label="Delete comment"
				title="Delete comment"
				onclick={onDelete}
			>&times;</button>
		</div>
	</div>
</li>
