<script lang="ts">
	import PrinciplesTab from '$lib/components/PrinciplesTab.svelte';
	import { getContext } from 'svelte';
	import { APP_KEY, type AppContext } from '$lib/app-context';

	const ctx = getContext<AppContext>(APP_KEY);
</script>

<PrinciplesTab onError={ctx.onError} widthClass={ctx.display.widthClass} lang={ctx.display.lang} />
