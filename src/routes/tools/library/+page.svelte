<script lang="ts">
	import { onMount } from 'svelte';
	import LibraryTab from '$lib/components/LibraryTab.svelte';
	import PublicHeader from '$lib/components/PublicHeader.svelte';
	import { contentWidthClass } from '$lib/display';
	import { showToast } from '$lib/toast.svelte';

	let { data } = $props();
	let widthClass = $state(contentWidthClass(undefined));
	let lang = $state('en');

	onMount(() => {
		try {
			const raw = localStorage.getItem('fermentario.config');
			if (!raw) return;
			const config = JSON.parse(raw) as { entriesLang?: string; contentWidth?: string };
			if (config?.entriesLang === 'en' || config?.entriesLang === 'es' || config?.entriesLang === 'pt') {
				lang = config.entriesLang;
			}
			widthClass = contentWidthClass(config?.contentWidth);
		} catch {
			// Keep the standard width and English when local preferences are unavailable.
		}
	});
</script>

<main class="min-h-dvh">
	<div class="mx-auto {widthClass} px-2 pt-[max(1rem,env(safe-area-inset-top))] pb-24 sm:px-6">
		<PublicHeader siteTitle={data.publicConfig.siteTitle} />
		<LibraryTab onError={(message) => showToast(message)} {widthClass} {lang} />
	</div>
</main>
