<script lang="ts">
	import BusinessesTab from '$lib/components/BusinessesTab.svelte';
	import { getContext } from 'svelte';
	import { APP_KEY, type AppContext } from '$lib/app-context';

	const ctx = getContext<AppContext>(APP_KEY);
</script>

<BusinessesTab
	sub="cubiq"
	orgId="b3"
	onError={ctx.onError}
	lang={ctx.display.lang}
	widthClass={ctx.display.widthClass}
/>
