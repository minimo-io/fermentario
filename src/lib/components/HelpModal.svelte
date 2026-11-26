<script lang="ts">
	import { onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import { SLOGAN } from '$lib/brand';
	import { SHORTCUTS, shortcutKeys } from '$lib/shortcuts';
	import { COMMANDS } from '$lib/commands';
	import { isAppleDevice } from '$lib/platform';
	import Kbd from '$lib/components/Kbd.svelte';

	type Props = { onClose: () => void };
	let { onClose }: Props = $props();

	type Tab = 'shortcuts' | 'commands';
	const TABS: { id: Tab; label: string }[] = [
		{ id: 'shortcuts', label: 'Shortcuts' },
		{ id: 'commands', label: 'Commands' }
	];

	let tab = $state<Tab>('shortcuts');
	let apple = $state(false);
	onMount(() => {
		apple = isAppleDevice();
	});
</script>

<svelte:window
	onkeydown={(e) => {
		if (e.key === 'Escape') onClose();
	}}
/>

<div
	class="fixed inset-0 z-50 grid place-items-center bg-stone-900/40 p-4 backdrop-blur-md dark:bg-black/60"
	role="dialog"
	aria-modal="true"
	aria-labelledby="help-title"
	tabindex="-1"
	onclick={(e) => {
		if (e.target === e.currentTarget) onClose();
	}}
	onkeydown={(e) => {
		if (e.key === 'Escape') onClose();
	}}
	transition:fade={{ duration: motionMs(BACKDROP_MS) }}
>
	<div
		class="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-xl dark:bg-stone-900"
		transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}
	>
		<div class="flex items-start justify-between gap-2">
			<div class="min-w-0">
				<h2 id="help-title" class="text-base font-semibold text-stone-900 dark:text-stone-100">{SLOGAN}</h2>
			</div>
			<button
				type="button"
				class="-mr-1 -mt-1 grid h-8 w-8 shrink-0 place-items-center rounded-full text-lg leading-none text-stone-400 hover:bg-stone-100 hover:text-stone-600 dark:text-stone-500 dark:hover:bg-stone-800 dark:hover:text-stone-300"
				aria-label="Close help"
				onclick={onClose}
			>&times;</button>
		</div>

		<div
			class="no-scrollbar -mx-1 mb-4 mt-4 flex min-w-0 flex-1 snap-x gap-2 overflow-x-auto px-1 pb-1"
			role="tablist"
			aria-label="Help sections"
		>
			{#each TABS as t (t.id)}
				<button
					type="button"
					role="tab"
					aria-selected={tab === t.id}
					class="inline-flex shrink-0 snap-start items-center rounded-full px-4 py-1.5 text-sm font-medium select-none {tab === t.id
						? 'bg-stone-900 text-white dark:bg-stone-700'
						: 'text-stone-500 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800'}"
					onclick={() => (tab = t.id)}
				>{t.label}</button>
			{/each}
		</div>

		{#if tab === 'shortcuts'}
			<div role="tabpanel" aria-label="Shortcuts">
				<div class="mt-1 space-y-3">
					{#each SHORTCUTS as group (group.group)}
						<div>
							<p class="text-xs font-medium text-stone-800 dark:text-stone-100">{group.group}</p>
							<ul class="mt-1 space-y-1">
								{#each group.items as item (item.label)}
									<li class="flex items-baseline justify-between gap-3 text-sm text-stone-700 dark:text-stone-200">
										<span class="min-w-0">
											{item.label}
											{#if item.where}<span class="text-stone-400 dark:text-stone-500"> · {item.where}</span>{/if}
										</span>
										<span class="shrink-0"><Kbd keys={shortcutKeys(item.keys, apple)} always /></span>
									</li>
								{/each}
							</ul>
						</div>
					{/each}
				</div>
			</div>
		{:else}
			<div role="tabpanel" aria-label="Commands">
				<p class="text-sm text-stone-600 dark:text-stone-300">
					In search, type
					<span class="inline-flex items-center rounded-full border border-blue-200 bg-blue-100 px-2 py-0.5 text-[11px] font-medium text-blue-700 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300">:</span>,
					then a command code. No Space is needed. For example, <span class="font-mono text-xs">:note</span>.
					The colon alone lists every command, and the exact code also finds its command in normal search.
				</p>
				<ul class="mt-3 space-y-2">
					{#each COMMANDS as command (command.code)}
						{@const Icon = command.icon}
						<li class="flex items-start gap-3 rounded-xl border border-stone-200 p-3 dark:border-stone-800">
							<span class="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-md bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300">
								<Icon class="h-4 w-4" />
							</span>
							<span class="min-w-0 flex-1">
								<span class="block text-sm font-medium text-stone-900 dark:text-stone-100">{command.label}</span>
								<span class="block text-xs text-stone-500 dark:text-stone-400">{command.description}</span>
							</span>
							<span
								class="shrink-0 rounded-md border border-stone-200 bg-stone-50 px-1.5 py-0.5 font-mono text-[10px] text-stone-500 dark:border-stone-700 dark:bg-stone-800 dark:text-stone-400"
							>:{command.code}{#if command.aliases?.length} · {command.aliases.map((alias) => `:${alias}`).join(', ')}{/if}</span>
						</li>
					{/each}
				</ul>
			</div>
		{/if}
	</div>
</div>
