<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { ArrowLeft } from '@lucide/svelte';
	import { contentWidthClass } from '$lib/display';

	type Row = { label: string; value: string; ok?: boolean };
	let rows: Row[] = $state([]);
	let contentClass = $state('max-w-2xl');

	function goBack() {
		if (window.history.length > 1) window.history.back();
		else goto('/admin/notes');
	}

	function report() {
		return ['fermentario diagnostics', new Date().toISOString(), ...rows.map((r) => `${r.ok === true ? 'ok' : r.ok === false ? 'FAIL' : '-'} ${r.label}: ${r.value}`)].join('\n');
	}

	onMount(async () => {
		try {
			const raw = localStorage.getItem('fermentario.config');
			if (raw) contentClass = contentWidthClass((JSON.parse(raw) as { contentWidth?: string })?.contentWidth);
		} catch {}
		rows = [
			{ label: 'User agent', value: navigator.userAgent },
			{ label: 'Speech synthesis', value: 'speechSynthesis' in window ? 'available' : 'absent', ok: 'speechSynthesis' in window },
			{ label: 'IndexedDB', value: 'indexedDB' in window ? 'available' : 'absent', ok: 'indexedDB' in window }
		];
		try {
			const res = await fetch('/api/notes?limit=1');
			rows.push({ label: 'Journal API', value: `HTTP ${res.status}`, ok: res.ok });
		} catch (err) {
			rows.push({ label: 'Journal API', value: String(err), ok: false });
		}
	});
</script>

<svelte:head><title>Diagnostics</title></svelte:head>

<div class="mx-auto {contentClass} px-6 pt-[max(1rem,env(safe-area-inset-top))] pb-24">
	<button
		type="button"
		class="mb-4 inline-flex items-center gap-1.5 rounded-full border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-900 px-3 py-1.5 text-xs font-medium text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-stone-500"
		onclick={goBack}><ArrowLeft class="h-3.5 w-3.5" /> Back</button
	>
	<h1 class="text-2xl font-semibold">Diagnostics</h1>
	<p class="mt-2 text-sm text-stone-600 dark:text-stone-300">Copy these results when you report a problem.</p>
	<div class="mt-6">
		<button class="rounded-md border border-stone-300 dark:border-stone-700 px-3 py-1.5 text-sm" onclick={() => navigator.clipboard?.writeText(report())}>Copy report</button>
	</div>
	<dl class="mt-6 divide-y divide-stone-200 dark:divide-stone-800 border-t border-stone-200 dark:border-stone-800">
		{#each rows as row (row.label)}
			<div class="grid grid-cols-[1fr_auto] gap-4 py-2 text-sm">
				<dt class="text-stone-700 dark:text-stone-300">{row.label}</dt>
				<dd class="text-right font-mono text-xs">{row.value}</dd>
			</div>
		{/each}
	</dl>
</div>
