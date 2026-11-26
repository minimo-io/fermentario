<script lang="ts">
	import { page } from '$app/state';
	import House from '@lucide/svelte/icons/house';
	import Search from '@lucide/svelte/icons/search';
	import CircleHelp from '@lucide/svelte/icons/circle-help';
	import { help } from '$lib/help.svelte';
	import { search } from '$lib/search.svelte';
	import { SLOGAN } from '$lib/brand';

	// The one header for every non-admin route: site title, the Admin link, and
	// a home button everywhere except the homepage itself. Pages keep their own
	// container and width; this component only draws the row.
	type Props = { siteTitle: string };
	let { siteTitle }: Props = $props();

	const onHome = $derived(page.url.pathname === '/');
</script>

<header class="mb-5 flex items-center justify-between gap-2">
	<div class="flex min-w-0 items-baseline gap-3">
		<h1 class="min-w-0 truncate text-2xl font-semibold tracking-tight text-stone-900 dark:text-stone-100">
			<a href="/" class="hover:underline">{siteTitle}</a>
		</h1>
		<span class="hidden truncate text-xs text-stone-400 dark:text-stone-500 md:inline">{SLOGAN}</span>
	</div>
	<span class="flex shrink-0 items-center gap-2">
		{#if !onHome}
			<a
				href="/"
				class="grid h-7 w-7 place-items-center rounded-full border border-stone-300 bg-white text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
				aria-label="Public homepage"
				title="Public homepage"
			><House class="h-3.5 w-3.5" /></a>
		{/if}
		<button
			type="button"
			class="grid h-7 w-7 place-items-center rounded-full border border-stone-300 bg-white text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
			aria-label="Search"
			title="Search"
			onclick={() => search.openSearch()}
		><Search class="h-3.5 w-3.5" /></button>
		<button
			type="button"
			class="grid h-7 w-7 place-items-center rounded-full border border-stone-300 bg-white text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
			aria-label="Help and shortcuts"
			title="Help and shortcuts"
			onclick={() => help.openModal()}
		><CircleHelp class="h-3.5 w-3.5" /></button>
		<a
			href="/admin/notes"
			class="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-medium text-stone-600 hover:bg-stone-100 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-300 dark:hover:bg-stone-800"
		>Dashboard</a>
	</span>
</header>
