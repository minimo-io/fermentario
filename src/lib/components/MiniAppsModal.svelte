<script lang="ts">
	import { fade, fly } from 'svelte/transition';
	import { onMount } from 'svelte';
	import X from '@lucide/svelte/icons/x';
	import { BACKDROP_MS, PANEL_MS, PANEL_Y, motionMs } from '$lib/motion';
	import { miniApps, openLatestNote, openMiniApp } from '$lib/mini-apps.svelte';
	import { shortcutKeys } from '$lib/shortcuts';
	import { isAppleDevice } from '$lib/platform';
	import Kbd from '$lib/components/Kbd.svelte';
	import { timeTracker } from '$lib/time-tracker.svelte';
	import { newNote } from '$lib/new-note.svelte';

	function close() {
		miniApps.closeModal();
	}

	function isRunning(id: string): boolean {
		return id === 'time-tracker' && !!timeTracker.running;
	}

	let apple = $state(false);
	onMount(() => {
		apple = isAppleDevice();
	});

	const latest = $derived(miniApps.latestUsedId());
	const apps = $derived(miniApps.orderedApps());
</script>

<svelte:window
	onkeydown={(e) => {
		if (miniApps.open && e.key === 'Escape') close();
	}}
/>

{#if miniApps.open}
	<div
		class="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/40 p-4 backdrop-blur-md dark:bg-black/60 sm:items-center"
		role="dialog"
		aria-modal="true"
		aria-label="Mini apps"
		tabindex="-1"
		onclick={(e) => { if (e.target === e.currentTarget) close(); }}
		onkeydown={(e) => { if (e.key === 'Escape') close(); }}
		transition:fade={{ duration: motionMs(BACKDROP_MS) }}
	>
		<div
			class="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl dark:bg-stone-900"
			transition:fly={{ y: PANEL_Y, duration: motionMs(PANEL_MS) }}
		>
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">Mini apps</h2>
				<button
					type="button"
					class="grid h-7 w-7 place-items-center rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-stone-800"
					aria-label="Close"
					onclick={close}
				><X class="h-4 w-4" /></button>
			</div>

			<ul class="space-y-1">
				{#each apps as app (app.id)}
					{@const Icon = app.icon}
					{@const running = isRunning(app.id)}
					<li>
						<button
							type="button"
							class="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-stone-100 dark:hover:bg-stone-800"
							onclick={() => openMiniApp(app)}
						>
							<span class="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200">
								<Icon class="h-4.5 w-4.5" />
								{#if running}
									<span class="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-white dark:ring-stone-900" aria-label="Running"></span>
								{/if}
							</span>
							<span class="min-w-0 flex-1">
								<span class="flex items-center gap-2">
									<span class="text-sm font-medium text-stone-900 dark:text-stone-100">{app.label}</span>
									{#if app.id === 'new-note' && newNote.hasDraft}
										<span class="rounded-full bg-lime-100 px-2 py-0.5 text-[10px] font-medium text-lime-800 dark:bg-lime-950/50 dark:text-lime-300">Draft</span>
									{/if}
									{#if latest === app.id}
										<span class="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">Latest used</span>
									{/if}
									{#if app.id === 'time-tracker' && timeTracker.chiming}
										<span class="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">Chiming</span>
									{:else if running}
										<span class="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">Running</span>
									{/if}
								</span>
								<span class="mt-0.5 block text-[12px] text-stone-500 dark:text-stone-400">{app.description}</span>
							</span>
							{#if app.shortcut}
								<span class="shrink-0 self-center"><Kbd keys={shortcutKeys(app.shortcut, apple)} /></span>
							{/if}
						</button>
						{#if app.id === 'new-note' && miniApps.latestNote}
							<button
								type="button"
								class="ml-[3.75rem] -mt-1 mb-1 rounded-full border border-stone-200 px-2 py-0.5 text-[10px] font-medium leading-4 text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:text-stone-300 dark:hover:bg-stone-800"
								aria-label="Open latest note"
								onclick={openLatestNote}
							>Latest note</button>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	</div>
{/if}
