<script lang="ts">
	import { onMount } from 'svelte';
	import TimeTrackerTab from '$lib/components/TimeTrackerTab.svelte';
	import PublicHeader from '$lib/components/PublicHeader.svelte';
	import { contentWidthClass } from '$lib/display';
	import { showToast } from '$lib/toast.svelte';

	let { data } = $props();

	// A tool page, not an admin page: it reads no APP_KEY context, so it can
	// render outside /admin for a non-admin viewer.
	let widthClass = $state(contentWidthClass(undefined));
	let lang = $state('en');

	onMount(() => {
		try {
			const raw = localStorage.getItem('fermentario.config');
			if (!raw) return;
			const c = JSON.parse(raw) as { entriesLang?: string; contentWidth?: string };
			if (c?.entriesLang === 'en' || c?.entriesLang === 'es' || c?.entriesLang === 'pt') lang = c.entriesLang;
			widthClass = contentWidthClass(c?.contentWidth);
		} catch {
			// Unreadable storage: keep the standard width and English.
		}
	});
</script>

<main class="min-h-dvh">
	<div class="mx-auto {widthClass} px-2 pt-[max(1rem,env(safe-area-inset-top))] pb-24 sm:px-6">
		<PublicHeader siteTitle={data.publicConfig.siteTitle} />
		<TimeTrackerTab onError={(msg) => showToast(msg)} {widthClass} {lang} />
	</div>
</main>
