<script lang="ts">
	import type { Snippet } from 'svelte';
	import ChevronDown from '@lucide/svelte/icons/chevron-down';
	import { slide } from 'svelte/transition';
	import { motionMs } from '$lib/motion';

	// The one toggleable-section pattern: header button with the rotating
	// chevron, `slide` body over `motionMs(180)`, collapsed state remembered
	// under the given key. Every collapsible section uses this, so no two
	// toggles can drift apart again.
	type Props = {
		label: string;
		storageKey: string;
		icon?: Snippet;
		actions?: Snippet;
		/** Hide the actions line while collapsed (Market's Update/Logs:
		 *  both act on content that is not visible when the group is shut). */
		actionsOnExpandOnly?: boolean;
		children: Snippet;
	};
	let { label, storageKey, icon, actions, actionsOnExpandOnly = false, children }: Props = $props();

	// Read the remembered state synchronously at init — not in an $effect.
	// Correcting it after mount flashes open-then-shut every time a parent
	// toggle remounts this section.
	function readStored(): boolean {
		try {
			return localStorage.getItem(storageKey) === '1';
		} catch {
			return false;
		}
	}

	let collapsed = $state(readStored());

	function toggle() {
		collapsed = !collapsed;
		try {
			localStorage.setItem(storageKey, collapsed ? '1' : '0');
		} catch {}
	}
</script>

<div class="mb-1 flex items-center gap-1">
	<button
		type="button"
		class="flex min-w-0 items-center gap-1 rounded-full pr-2 text-stone-400 dark:text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-600 dark:hover:text-stone-300"
		aria-expanded={!collapsed}
		aria-label={collapsed ? `Expand ${label.toLowerCase()}` : `Collapse ${label.toLowerCase()}`}
		onclick={toggle}
	>
		<span class="grid h-6 w-6 shrink-0 place-items-center">
			<ChevronDown class="h-4 w-4 transition-transform duration-200 motion-reduce:transition-none {collapsed ? '-rotate-90' : ''}" />
		</span>
		{#if icon}{@render icon()}{/if}
		<span class="text-xs font-medium uppercase tracking-widest">{label}</span>
	</button>
	{#if actions && (!actionsOnExpandOnly || !collapsed)}
		<span class="ml-auto inline-flex items-center gap-2">{@render actions()}</span>
	{/if}
</div>
{#if !collapsed}
	<div transition:slide={{ duration: motionMs(180) }}>
		{@render children()}
	</div>
{/if}
