<script lang="ts">
	import { getContext } from 'svelte';
	import EpubReader from '$lib/components/EpubReader.svelte';
	import { APP_KEY, type AppContext } from '$lib/app-context';
	import type { Book, BookNotesPage } from '$lib/types';

	let { data } = $props();
	const ctx = getContext<AppContext>(APP_KEY);
</script>

<EpubReader book={data.book as Book} notesPage={data.notesPage as BookNotesPage} onError={ctx.onError} />

<svelte:head>
	<title>{(data.book as Book).title} · fermentario</title>
</svelte:head>
